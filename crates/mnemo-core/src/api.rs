//! Fachada pública do core. É o único ponto que os adaptadores (napi, Tauri) enxergam.

use crate::application::git::RepoGit;
use crate::application::graph::{refs_by_sha, CommitInput, GraphCursor, GraphPage, GraphRef, WipSummary};
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
use std::collections::{BTreeMap, HashMap, HashSet};
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

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LocalRef {
    pub name: String,
    pub sha: String,
    pub current: bool,
    pub upstream: Option<String>,
    pub ahead: Option<u64>,
    pub behind: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteRef {
    pub remote: String,
    pub name: String,
    pub sha: String,
    pub local_exists: bool,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteFolder {
    pub name: String,
    pub branches: Vec<RemoteRef>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RemoteGroup {
    pub name: String,
    pub branches: Vec<RemoteRef>,
    pub folders: Vec<RemoteFolder>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct NamedRef {
    pub name: String,
    pub sha: String,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorktreeRef {
    pub path: String,
    pub branch: Option<String>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RefListing {
    pub local: Vec<LocalRef>,
    pub remotes: Vec<RemoteGroup>,
    pub worktrees: Vec<WorktreeRef>,
    pub stashes: Vec<NamedRef>,
    pub tags: Vec<NamedRef>,
    pub submodules: Vec<NamedRef>,
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

    /// Um retrato das refs do painel esquerdo. A contagem de ahead/behind vem do
    /// próprio for-each-ref, sem abrir um processo por branch.
    pub fn list_refs(&self, path: &str) -> Result<RefListing> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        let current = git.capture_state(false)?.head_ref;
        let raw = git.text([
            "for-each-ref",
            "--sort=refname",
            "--format=%(refname)%00%(objectname)%00%(upstream:short)%00%(upstream:track,nobracket)%00%(*objectname)",
            "refs/heads",
            "refs/remotes",
            "refs/tags",
        ])?;
        let remote_names = git.remotes()?;
        let mut local = Vec::new();
        let mut remote_refs = Vec::new();
        let mut tags = Vec::new();
        for line in raw.lines() {
            let fields: Vec<&str> = line.split('\0').collect();
            if fields.len() < 5 {
                continue;
            }
            let (full, sha, upstream, track) = (fields[0], fields[1], fields[2], fields[3]);
            if let Some(name) = full.strip_prefix("refs/heads/") {
                let (ahead, behind) = if upstream.is_empty() || track.contains("gone") {
                    (None, None)
                } else {
                    let count = |word: &str| {
                        track
                            .split([',', ' '])
                            .collect::<Vec<_>>()
                            .windows(2)
                            .find(|pair| pair[0] == word)
                            .and_then(|pair| pair[1].parse::<u64>().ok())
                            .unwrap_or(0)
                    };
                    (Some(count("ahead")), Some(count("behind")))
                };
                local.push(LocalRef {
                    name: name.into(),
                    sha: sha.into(),
                    current: current.as_deref() == Some(full),
                    upstream: (!upstream.is_empty() && !track.contains("gone")).then(|| upstream.into()),
                    ahead,
                    behind,
                });
            } else if let Some(name) = full.strip_prefix("refs/tags/") {
                tags.push(NamedRef {
                    name: name.into(),
                    sha: if fields[4].is_empty() { sha } else { fields[4] }.into(),
                });
            } else if let Some(rest) = full.strip_prefix("refs/remotes/") {
                if let Some(remote) =
                    remote_names.iter().filter(|r| rest.starts_with(&format!("{r}/"))).max_by_key(|r| r.len())
                {
                    let name = &rest[remote.len() + 1..];
                    if name != "HEAD" {
                        remote_refs.push(RemoteRef {
                            remote: remote.clone(),
                            name: name.into(),
                            sha: sha.into(),
                            local_exists: local.iter().any(|b| b.name == name),
                        });
                    }
                }
            }
        }
        // for-each-ref já ordena por refname: refs/heads vêm antes das remotas.
        let remotes = group_remotes(remote_refs);
        let worktrees = parse_worktrees(&git.text(["worktree", "list", "--porcelain"])?);
        let stashes = git
            .stash_list()?
            .into_iter()
            .enumerate()
            .map(|(i, e)| NamedRef { name: format!("stash@{{{i}}}: {}", e.message), sha: e.sha })
            .collect();
        let submodule_output = git.exec(&GitCmd::new(["submodule", "status"]).also_ok(1))?;
        let submodules = submodule_output
            .text()
            .lines()
            .filter_map(|line| {
                let content = line.trim_start_matches([' ', '-', '+', 'U']);
                let (sha, rest) = content.split_once(' ')?;
                let name = rest.split(" (").next()?.to_string();
                Some(NamedRef { name, sha: sha.into() })
            })
            .collect();
        Ok(RefListing { local, remotes, worktrees, stashes, tags, submodules })
    }

    /// Quantas mudanças locais tocam arquivos que diferem no alvo do checkout.
    /// O preview nunca altera o repositório; o git ainda valida o checkout ao executar.
    pub fn checkout_conflict_count(&self, path: &str, target: &str) -> Result<usize> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        let diff = git.exec(&GitCmd::new(["diff", "--name-only", "-z", "HEAD", target]))?;
        let changed: HashSet<&[u8]> = diff.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()).collect();
        if changed.is_empty() {
            return Ok(0);
        }
        let status = git.exec(&GitCmd::new(["status", "--porcelain=v1", "-z", "--untracked-files=all"]))?;
        let mut count = 0;
        let mut fields = status.stdout.split(|b| *b == 0).filter(|p| !p.is_empty());
        while let Some(entry) = fields.next() {
            if entry.len() < 4 {
                continue;
            }
            if changed.contains(&entry[3..]) {
                count += 1;
            }
            if entry[0] == b'R' || entry[1] == b'R' || entry[0] == b'C' || entry[1] == b'C' {
                let _ = fields.next(); // porcelain -z inclui também o caminho original
            }
        }
        Ok(count)
    }

    /// Página topológica do grafo. O cursor traz as lanes abertas da página anterior.
    pub fn graph_page(&self, path: &str, cursor: Option<GraphCursor>, requested: usize) -> Result<GraphPage> {
        let session = self.session_for(Path::new(path))?;
        let git = RepoGit::new(self.git.clone(), session.workdir().to_path_buf());
        let refs = self.list_refs(path)?;
        let head_sha = git.head_sha();
        let mut labels = Vec::new();
        let mut revs = Vec::new();
        for branch in &refs.local {
            revs.push(format!("refs/heads/{}", branch.name));
            labels.push((
                branch.sha.clone(),
                GraphRef { name: branch.name.clone(), kind: "local".into(), current: branch.current },
            ));
        }
        for group in &refs.remotes {
            for remote in group.branches.iter().chain(group.folders.iter().flat_map(|folder| folder.branches.iter())) {
                if !remote.local_exists {
                    continue;
                }
                revs.push(format!("refs/remotes/{}/{}", remote.remote, remote.name));
                labels.push((
                    remote.sha.clone(),
                    GraphRef {
                        name: format!("{}/{}", remote.remote, remote.name),
                        kind: "remote".into(),
                        current: false,
                    },
                ));
            }
        }
        for tag in &refs.tags {
            revs.push(format!("refs/tags/{}", tag.name));
            labels.push((tag.sha.clone(), GraphRef { name: tag.name.clone(), kind: "tag".into(), current: false }));
        }
        if head_sha.is_some() {
            revs.push("HEAD".into());
        }
        let wip = graph_wip(&git)?;
        if revs.is_empty() {
            return Ok(GraphPage { commits: Vec::new(), next: None, wip });
        }
        let limit = requested.clamp(1, 2000);
        let mut cursor = cursor.unwrap_or_default();
        let mut args = vec![
            "log".into(),
            "--topo-order".into(),
            "--no-decorate".into(),
            "-z".into(),
            "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s".into(),
            format!("--skip={}", cursor.offset),
            format!("--max-count={}", limit + 1),
        ];
        args.extend(revs);
        let output = git.exec(&GitCmd::new(args))?;
        let fields: Vec<&[u8]> = output.stdout.split(|b| *b == 0).collect();
        let mut inputs = Vec::new();
        for record in fields.chunks_exact(6) {
            if record[0].is_empty() {
                continue;
            }
            let string = |bytes: &[u8]| String::from_utf8_lossy(bytes).into_owned();
            inputs.push(CommitInput {
                sha: string(record[0]),
                parents: string(record[1]).split_whitespace().map(str::to_string).collect(),
                author: string(record[2]),
                email: string(record[3]),
                timestamp: string(record[4]).parse().unwrap_or(0),
                subject: string(record[5]),
            });
        }
        let has_more = inputs.len() > limit;
        let by_sha = refs_by_sha(labels);
        let commits = inputs
            .into_iter()
            .take(limit)
            .map(|input| {
                let labels = by_sha.get(&input.sha).cloned().unwrap_or_default();
                cursor.layout(input, labels, head_sha.as_deref())
            })
            .collect();
        Ok(GraphPage { commits, next: has_more.then_some(cursor), wip })
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
        if cmd == "list_refs" {
            return out(self.list_refs(&path)?);
        }
        if cmd == "checkout_conflict_count" {
            let target =
                args.get("target").and_then(Value::as_str).ok_or_else(|| CoreError::invalid("target ausente"))?;
            return out(self.checkout_conflict_count(&path, target)?);
        }
        if cmd == "graph_page" {
            let cursor: Option<GraphCursor> = parse(&json!(args.get("cursor").cloned().unwrap_or(Value::Null)))?;
            let limit = args.get("limit").and_then(Value::as_u64).unwrap_or(2000) as usize;
            return out(self.graph_page(&path, cursor, limit)?);
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

fn group_remotes(refs: Vec<RemoteRef>) -> Vec<RemoteGroup> {
    let mut groups: BTreeMap<String, (Vec<RemoteRef>, BTreeMap<String, Vec<RemoteRef>>)> = BTreeMap::new();
    for branch in refs {
        let group = groups.entry(branch.remote.clone()).or_default();
        if let Some(prefix) = remote_prefix(&branch.name) {
            group.1.entry(prefix).or_default().push(branch);
        } else {
            group.0.push(branch);
        }
    }
    groups
        .into_iter()
        .map(|(name, (branches, folders))| RemoteGroup {
            name,
            branches,
            folders: folders.into_iter().map(|(name, branches)| RemoteFolder { name, branches }).collect(),
        })
        .collect()
}

fn remote_prefix(name: &str) -> Option<String> {
    if let Some((prefix, _)) = name.split_once('/') {
        return Some(prefix.into());
    }
    if let Some((major, _)) = name.split_once('.') {
        if !major.is_empty() && major.bytes().all(|b| b.is_ascii_digit()) {
            return Some(format!("{major}.x"));
        }
    }
    let bytes = name.as_bytes();
    if bytes.len() >= 6 && bytes[0] == b't' && bytes[1..].iter().all(u8::is_ascii_digit) {
        return Some(format!("t{}xxxx", bytes[1] as char));
    }
    None
}

fn parse_worktrees(raw: &str) -> Vec<WorktreeRef> {
    let mut items = Vec::new();
    let mut path: Option<String> = None;
    let mut branch: Option<String> = None;
    for line in raw.lines().chain(std::iter::once("")) {
        if line.is_empty() {
            if let Some(p) = path.take() {
                items.push(WorktreeRef { path: p, branch: branch.take() });
            }
        } else if let Some(p) = line.strip_prefix("worktree ") {
            path = Some(p.into());
        } else if let Some(b) = line.strip_prefix("branch refs/heads/") {
            branch = Some(b.into());
        }
    }
    items
}

fn graph_wip(git: &RepoGit) -> Result<WipSummary> {
    let output = git.exec(&GitCmd::new(["status", "--porcelain=v1", "-z", "--untracked-files=all"]))?;
    let mut changed = 0;
    let mut untracked = 0;
    let mut entries = output.stdout.split(|b| *b == 0).filter(|part| !part.is_empty());
    while let Some(entry) = entries.next() {
        if entry.len() < 3 {
            continue;
        }
        if entry.starts_with(b"??") {
            untracked += 1;
        } else {
            changed += 1;
        }
        if entry[0] == b'R' || entry[1] == b'R' || entry[0] == b'C' || entry[1] == b'C' {
            let _ = entries.next();
        }
    }
    Ok(WipSummary { changed, untracked })
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
