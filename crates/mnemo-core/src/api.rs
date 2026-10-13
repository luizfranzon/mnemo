//! Fachada pública do core. É o único ponto que os adaptadores (napi, Tauri) enxergam.

use crate::application::git::RepoGit;
use crate::application::handlers::HandlerSet;
use crate::application::ports::{EventSink, GitCmd, GitPort, HistoryStore};
use crate::application::session::{RepoSession, SessionDeps};
use crate::application::snapshot::SNAPSHOT_SIZE_LIMIT;
use crate::diag;
use crate::domain::error::{CoreError, Result};
use crate::domain::history::HISTORY_LIMIT;
use crate::domain::operation::OperationKind;
use crate::domain::repo_state::{short_ref, short_sha};
use crate::domain::undo_state::UndoRedoState;
use crate::infrastructure::json_history_store::JsonHistoryStore;
use crate::infrastructure::process_git::ProcessGit;
use crate::infrastructure::PinnedRefsCleaner;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::{Path, PathBuf};
use std::sync::{Arc, RwLock};

pub const MIN_GIT: (u32, u32) = (2, 40); // `merge-tree --write-tree --merge-base`

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct GitInfo {
    pub version: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "kind", rename_all = "camelCase")]
pub enum HeadInfo {
    Branch {
        name: String,
        /// "origin/main"; `None` quando o Push precisa definir o upstream.
        upstream: Option<String>,
    },
    /// HEAD destacado: SHA curto.
    Detached { sha: String },
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RepositoryInfo {
    pub path: PathBuf,
    pub name: String,
    pub head: HeadInfo,
    pub undo: UndoRedoState,
    pub toolbar: ToolbarInfo,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ToolbarInfo {
    pub remotes: Vec<String>,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
    pub last_fetch_epoch: Option<u64>,
    pub stash_count: usize,
    pub pull_mode: String,
    pub progress: Option<ProgressInfo>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressInfo {
    pub kind: String,
    pub step: Option<u32>,
    pub total: Option<u32>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct BranchInfo {
    pub name: String,
    pub sha: String,
    pub current: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteBranchInfo {
    pub remote: String,
    pub name: String,
}

#[derive(Deserialize)]
struct PathArgs {
    path: String,
}

pub struct Mnemo {
    git: Arc<dyn GitPort>,
    store: Arc<dyn HistoryStore>,
    events: Arc<dyn EventSink>,
    handlers: Arc<HandlerSet>,
    sessions: RwLock<HashMap<String, Arc<RepoSession>>>,
}

impl Mnemo {
    /// Monta o core com o git do sistema e histórico em `data_dir`.
    pub fn new(data_dir: impl AsRef<Path>, events: Arc<dyn EventSink>) -> Self {
        diag::init(data_dir.as_ref());
        Self::with_git(ProcessGit::from_path(), data_dir, events)
    }

    pub fn with_git(git: impl GitPort + 'static, data_dir: impl AsRef<Path>, events: Arc<dyn EventSink>) -> Self {
        Self {
            git: Arc::new(git),
            store: Arc::new(JsonHistoryStore::new(data_dir)),
            events,
            handlers: Arc::new(HandlerSet::default()),
            sessions: RwLock::new(HashMap::new()),
        }
    }

    /// Verifica o git do sistema (executado ao abrir o app).
    pub fn check_git(&self) -> Result<GitInfo> {
        let out = self.git.run(&std::env::temp_dir(), &GitCmd::new(["--version"]))?;
        let text = out.text();
        let version = text.split_whitespace().nth(2).unwrap_or_default().to_string();
        let mut nums = version.split('.').map(|p| p.parse::<u32>().unwrap_or(0));
        let found = (nums.next().unwrap_or(0), nums.next().unwrap_or(0));
        if found < MIN_GIT {
            return Err(CoreError::GitTooOld { found: version, min: format!("{}.{}", MIN_GIT.0, MIN_GIT.1) });
        }
        Ok(GitInfo { version })
    }

    /// Abre (ou reaproveita) o repositório que contém `path`.
    pub fn open_repository(&self, path: &str) -> Result<RepositoryInfo> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        let state = git.capture_state(false)?;
        let head = match (&state.head_ref, &state.head_sha) {
            (Some(r), _) => {
                let name = short_ref(r).to_string();
                HeadInfo::Branch { upstream: git.upstream(&name)?, name }
            }
            (None, Some(sha)) => HeadInfo::Detached { sha: short_sha(sha).to_string() },
            (None, None) => return Err(CoreError::NotARepository { path: path.to_string() }),
        };
        let name = session.workdir().file_name().map(|n| n.to_string_lossy().into_owned()).unwrap_or_default();
        let toolbar = self.toolbar_info(&git)?;
        Ok(RepositoryInfo { path: session.workdir().to_path_buf(), name, head, undo: session.undo_state(), toolbar })
    }

    fn toolbar_info(&self, git: &RepoGit) -> Result<ToolbarInfo> {
        let counts = git.ahead_behind()?;
        let progress = git.in_progress().map(|kind| {
            let steps = git.progress_steps();
            ProgressInfo { kind: kind.name().into(), step: steps.map(|s| s.0), total: steps.map(|s| s.1) }
        });
        Ok(ToolbarInfo {
            remotes: git.remotes()?,
            ahead: counts.map(|c| c.0),
            behind: counts.map(|c| c.1),
            last_fetch_epoch: git.last_fetch_epoch()?,
            stash_count: git.stash_list()?.len(),
            pull_mode: git.pull_mode()?,
            progress,
        })
    }

    pub fn set_pull_mode(&self, path: &str, mode: &str) -> Result<ToolbarInfo> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        git.set_pull_mode(mode)?;
        self.toolbar_info(&git)
    }

    /// Branches locais, para a paleta de checkout.
    pub fn list_branches(&self, path: &str) -> Result<Vec<BranchInfo>> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        let current = git.capture_state(false)?.head_ref;
        Ok(git
            .local_branches()?
            .into_iter()
            .map(|(name, sha)| BranchInfo {
                current: current.as_deref() == Some(&format!("refs/heads/{name}")),
                name,
                sha,
            })
            .collect())
    }

    /// Branches remotas, para excluir no remoto.
    pub fn list_remote_branches(&self, path: &str) -> Result<Vec<RemoteBranchInfo>> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        Ok(git.remote_branches()?.into_iter().map(|(remote, name)| RemoteBranchInfo { remote, name }).collect())
    }

    pub fn close_repository(&self, path: &str) {
        if let Ok(root) = self.toplevel(Path::new(path)) {
            if let Ok(mut map) = self.sessions.write() {
                map.remove(&key(&root));
            }
        }
    }

    pub fn session_for(&self, path: &Path) -> Result<Arc<RepoSession>> {
        let root = self.toplevel(path)?;
        let k = key(&root);
        if let Some(s) = self.sessions.read().map_err(poisoned)?.get(&k) {
            return Ok(s.clone());
        }
        // Abre fora do lock global (carregar histórico + checar Mudança externa chama o git).
        let session = Arc::new(RepoSession::open(root, self.session_deps())?);
        let mut map = self.sessions.write().map_err(poisoned)?;
        Ok(map.entry(k).or_insert(session).clone())
    }

    fn toplevel(&self, path: &Path) -> Result<PathBuf> {
        let not_repo = || CoreError::NotARepository { path: path.to_string_lossy().into_owned() };
        if !path.is_dir() {
            return Err(not_repo());
        }
        let cmd = GitCmd::new(["rev-parse", "--show-toplevel"]).also_ok(128);
        let out = self.git.run(path, &cmd)?;
        if out.code != 0 || out.text().is_empty() {
            return Err(not_repo());
        }
        Ok(PathBuf::from(out.text()))
    }

    fn session_deps(&self) -> SessionDeps {
        SessionDeps {
            git: self.git.clone(),
            store: self.store.clone(),
            events: self.events.clone(),
            handlers: self.handlers.clone(),
            hooks: vec![Arc::new(PinnedRefsCleaner)],
            snapshot_limit: SNAPSHOT_SIZE_LIMIT,
            history_limit: HISTORY_LIMIT,
        }
    }

    /// Ponte `invoke(cmd, args)` no formato do Tauri: JSON entra, JSON sai.
    pub fn invoke(&self, cmd: &str, args: Value) -> Result<Value> {
        self.dispatch(cmd, args)
    }

    fn dispatch(&self, cmd: &str, args: Value) -> Result<Value> {
        fn out<T: Serialize>(v: T) -> Result<Value> {
            serde_json::to_value(v).map_err(|e| CoreError::internal(e.to_string()))
        }
        fn parse<T: for<'de> Deserialize<'de>>(args: &Value) -> Result<T> {
            serde_json::from_value(args.clone()).map_err(|e| CoreError::invalid(e.to_string()))
        }
        if cmd == "log_error" {
            let text = |k: &str| {
                args.get(k).and_then(Value::as_str).unwrap_or_default().chars().take(8000).collect::<String>()
            };
            diag::error_from_js(&text("context"), &text("message"));
            return Ok(Value::Null);
        }
        if cmd == "check_git" {
            return out(self.check_git()?);
        }
        let PathArgs { path } = parse(&args)?;
        if cmd == "open_repository" {
            return out(self.open_repository(&path)?);
        }
        if cmd == "set_pull_mode" {
            let mode = args.get("mode").and_then(Value::as_str).ok_or_else(|| CoreError::invalid("mode ausente"))?;
            return out(self.set_pull_mode(&path, mode)?);
        }
        if cmd == "list_branches" {
            return out(self.list_branches(&path)?);
        }
        if cmd == "list_remote_branches" {
            return out(self.list_remote_branches(&path)?);
        }
        if cmd == "close_repository" {
            self.close_repository(&path);
            return Ok(Value::Null);
        }
        let s = self.session_for(Path::new(&path))?;
        match cmd {
            "execute_operation" => {
                let kind: OperationKind = parse(&json!(args.get("kind").cloned().unwrap_or(Value::Null)))?;
                out(s.execute(kind)?)
            }
            "undo" => out(s.undo()?),
            "redo" => out(s.redo()?),
            "undo_state" => out(s.undo_state()),
            "sync_external" => out(s.sync_external()?),
            "is_busy" => out(json!({ "busy": s.is_busy(), "label": s.running_label() })),
            "abort_in_progress" => out(s.abort_in_progress()?),
            "continue_in_progress" => out(s.continue_in_progress()?),
            "skip_in_progress" => out(s.skip_in_progress()?),
            "discard_preview" => {
                let paths: Vec<String> = parse(&json!(args.get("paths").cloned().unwrap_or(json!([]))))?;
                out(s.discard_preview(&paths)?)
            }
            "reset_preview" => {
                let target =
                    args.get("target").and_then(Value::as_str).ok_or_else(|| CoreError::invalid("target ausente"))?;
                out(s.reset_preview(target)?)
            }
            "restore_discard_as_copies" => {
                let op_id =
                    args.get("opId").and_then(Value::as_u64).ok_or_else(|| CoreError::invalid("opId ausente"))?;
                out(s.restore_discard_as_copies(op_id)?)
            }
            other => Err(CoreError::invalid(format!("comando desconhecido: {other}"))),
        }
    }
}

fn key(p: &Path) -> String {
    let s = p.to_string_lossy().replace('\\', "/");
    if cfg!(windows) {
        s.to_lowercase()
    } else {
        s
    }
}

fn poisoned<T>(_: T) -> CoreError {
    CoreError::internal("lock de sessões envenenado")
}
