use super::ports::{GitCmd, GitOutput, GitPort};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::StashEntry;
use crate::domain::repo_state::{RepoState, BRANCH_PREFIX};
use std::collections::BTreeMap;
use std::path::{Path, PathBuf};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::{Arc, OnceLock};
use std::time::UNIX_EPOCH;

pub const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

static TMP_COUNTER: AtomicU64 = AtomicU64::new(0);

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ProgressKind {
    Merge,
    Rebase,
    CherryPick,
    Revert,
}

impl ProgressKind {
    pub fn name(self) -> &'static str {
        match self {
            Self::Merge => "Merge",
            Self::Rebase => "Rebase",
            Self::CherryPick => "Cherry-pick",
            Self::Revert => "Revert",
        }
    }
    pub fn subcommand(self) -> &'static str {
        match self {
            Self::Merge => "merge",
            Self::Rebase => "rebase",
            Self::CherryPick => "cherry-pick",
            Self::Revert => "revert",
        }
    }
}

/// Leitura e primitivas do repositório de um diretório de trabalho, sobre a porta do git.
#[derive(Clone)]
pub struct RepoGit {
    port: Arc<dyn GitPort>,
    workdir: PathBuf,
    git_dir: Arc<OnceLock<PathBuf>>,
}

impl RepoGit {
    pub fn new(port: Arc<dyn GitPort>, workdir: PathBuf) -> Self {
        Self { port, workdir, git_dir: Arc::new(OnceLock::new()) }
    }

    pub fn workdir(&self) -> &Path {
        &self.workdir
    }

    pub fn exec(&self, cmd: &GitCmd) -> Result<GitOutput> {
        self.port.run(&self.workdir, cmd)
    }

    /// Roda e devolve a saída como texto (sem a quebra final).
    pub fn text<I, S>(&self, args: I) -> Result<String>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Ok(self.exec(&GitCmd::new(args))?.text())
    }

    pub fn run<I, S>(&self, args: I) -> Result<()>
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        self.exec(&GitCmd::new(args)).map(|_| ())
    }

    /// Diretório git deste diretório de trabalho (por worktree). Resolvido uma vez.
    pub fn git_dir(&self) -> Result<PathBuf> {
        if let Some(dir) = self.git_dir.get() {
            return Ok(dir.clone());
        }
        let dir = PathBuf::from(self.text(["rev-parse", "--absolute-git-dir"])?);
        Ok(self.git_dir.get_or_init(|| dir).clone())
    }

    pub fn index_lock_present(&self) -> bool {
        self.git_dir().map(|d| d.join("index.lock").exists()).unwrap_or(false)
    }

    pub fn in_progress(&self) -> Option<ProgressKind> {
        let dir = self.git_dir().ok()?;
        let has = |n: &str| dir.join(n).exists();
        if has("rebase-merge") || has("rebase-apply") {
            Some(ProgressKind::Rebase)
        } else if has("MERGE_HEAD") {
            Some(ProgressKind::Merge)
        } else if has("CHERRY_PICK_HEAD") {
            Some(ProgressKind::CherryPick)
        } else if has("REVERT_HEAD") {
            Some(ProgressKind::Revert)
        } else {
            None
        }
    }

    pub fn rev_parse(&self, rev: &str) -> Result<String> {
        self.text(["rev-parse", "--verify", "--quiet", &format!("{rev}^{{commit}}")])
    }

    pub fn head_sha(&self) -> Option<String> {
        self.exec(&GitCmd::new(["rev-parse", "-q", "--verify", "HEAD"]).also_ok(1))
            .ok()
            .filter(|o| o.code == 0)
            .map(|o| o.text())
    }

    /// Captura HEAD e as branches/tags locais com UM processo git (o HEAD vem do arquivo).
    /// `with_index` soma a árvore do index, que só as Operações que a restauram precisam.
    pub fn capture_state(&self, with_index: bool) -> Result<RepoState> {
        let (refs_out, index_tree) = std::thread::scope(|s| {
            let index = with_index.then(|| s.spawn(|| self.index_tree()));
            let refs = self.exec(&GitCmd::new([
                "for-each-ref",
                "--format=%(refname)%00%(objectname)",
                "refs/heads",
                "refs/tags",
            ]));
            let index_tree = match index {
                Some(h) => join(h)??,
                None => None,
            };
            Ok::<_, CoreError>((refs?, index_tree))
        })?;

        let mut refs = BTreeMap::new();
        for line in refs_out.text().lines() {
            if let Some((name, oid)) = line.split_once('\0') {
                refs.insert(name.to_string(), oid.to_string());
            }
        }
        let head_file = std::fs::read_to_string(self.git_dir()?.join("HEAD"))?;
        let head = head_file.trim();
        let (head_ref, head_sha) = match head.strip_prefix("ref: ") {
            Some(r) => (Some(r.to_string()), refs.get(r).cloned()),
            None => (None, Some(head.to_string())),
        };
        Ok(RepoState { head_ref, head_sha, refs, index_tree })
    }

    /// Árvore do index atual. Usa uma cópia do index: `write-tree` direto pegaria o
    /// `index.lock` e competiria com o git do usuário. `None` com conflito não resolvido.
    pub fn index_tree(&self) -> Result<Option<String>> {
        let Some(tmp) = self.copy_index()? else { return Ok(Some(EMPTY_TREE.to_string())) };
        let out = self.exec(&GitCmd::new(["write-tree"]).env("GIT_INDEX_FILE", tmp.to_string_lossy()).also_ok(128));
        let _ = std::fs::remove_file(&tmp);
        let out = out?;
        Ok((out.code == 0).then(|| out.text()).filter(|s| !s.is_empty()))
    }

    /// Árvore com o conteúdo atual do diretório de trabalho (rastreados + untracked não ignorados),
    /// montada num index temporário copiado do real, para reaproveitar o cache de stat.
    pub fn wip_tree(&self) -> Result<String> {
        let tmp = match self.copy_index()? {
            Some(tmp) => tmp,
            None => {
                // sem index ainda: parte da árvore de HEAD (ou vazia)
                let tmp = self.temp_index_path()?;
                let tree = if self.head_sha().is_some() { "HEAD" } else { EMPTY_TREE };
                self.exec(&GitCmd::new(["read-tree", tree]).env("GIT_INDEX_FILE", tmp.to_string_lossy()))?;
                tmp
            }
        };
        let env = tmp.to_string_lossy().to_string();
        let result = self
            .exec(&GitCmd::new(["add", "-A", "--", "."]).env("GIT_INDEX_FILE", env.clone()))
            .and_then(|_| self.exec(&GitCmd::new(["write-tree"]).env("GIT_INDEX_FILE", env)))
            .map(|o| o.text());
        let _ = std::fs::remove_file(&tmp);
        result
    }

    fn temp_index_path(&self) -> Result<PathBuf> {
        let n = TMP_COUNTER.fetch_add(1, Ordering::Relaxed);
        Ok(self.git_dir()?.join(format!("mnemo-index-{}-{n}", std::process::id())))
    }

    fn copy_index(&self) -> Result<Option<PathBuf>> {
        let real = self.git_dir()?.join("index");
        if !real.exists() {
            return Ok(None);
        }
        let tmp = self.temp_index_path()?;
        std::fs::copy(&real, &tmp)?;
        // o git decide "edição no mesmo segundo do último add" pelo mtime do index: a cópia precisa herdá-lo
        let mtime = std::fs::metadata(&real)?.modified()?;
        std::fs::OpenOptions::new().write(true).open(&tmp)?.set_modified(mtime)?;
        Ok(Some(tmp))
    }

    pub fn head_tree(&self) -> String {
        self.text(["rev-parse", "-q", "--verify", "HEAD^{tree}"])
            .ok()
            .filter(|t| !t.is_empty())
            .unwrap_or_else(|| EMPTY_TREE.to_string())
    }

    /// Branches locais (nome, SHA) em ordem alfabética. A atual vem marcada pelo chamador.
    pub fn local_branches(&self) -> Result<Vec<(String, String)>> {
        let out = self.exec(&GitCmd::new([
            "for-each-ref",
            "--sort=refname",
            "--format=%(refname:short)%00%(objectname)",
            "refs/heads",
        ]))?;
        Ok(out.text().lines().filter_map(|l| l.split_once('\0')).map(|(n, s)| (n.to_string(), s.to_string())).collect())
    }

    pub fn remotes(&self) -> Result<Vec<String>> {
        Ok(self.text(["remote"])?.lines().map(str::to_string).collect())
    }

    /// Upstream de uma branch local ("origin/main"), se tiver. Upstream apagado do remoto ("gone") conta como sem.
    pub fn upstream(&self, branch: &str) -> Result<Option<String>> {
        let out =
            self.text(["for-each-ref", "--format=%(upstream:short)%00%(upstream:track)", &Self::branch_ref(branch)])?;
        let (name, track) = out.split_once('\0').unwrap_or((&out, ""));
        Ok(Some(name.to_string()).filter(|u| !u.is_empty() && track != "[gone]"))
    }

    /// Contagens relativas ao upstream: primeiro commits locais, depois remotos.
    pub fn ahead_behind(&self) -> Result<Option<(u64, u64)>> {
        let out =
            self.exec(&GitCmd::new(["rev-list", "--left-right", "--count", "HEAD...@{upstream}"]).also_ok(128))?;
        if out.code != 0 {
            return Ok(None);
        }
        let counts: Vec<u64> = out.text().split_whitespace().filter_map(|n| n.parse().ok()).collect();
        Ok((counts.len() == 2).then(|| (counts[0], counts[1])))
    }

    pub fn last_fetch_epoch(&self) -> Result<Option<u64>> {
        let path = PathBuf::from(self.text(["rev-parse", "--git-path", "FETCH_HEAD"])?);
        let path = if path.is_absolute() { path } else { self.workdir.join(path) };
        Ok(std::fs::metadata(path)
            .ok()
            .and_then(|m| m.modified().ok())
            .and_then(|t| t.duration_since(UNIX_EPOCH).ok())
            .map(|d| d.as_secs()))
    }

    pub fn pull_mode(&self) -> Result<String> {
        let out = self.exec(&GitCmd::new(["config", "--get", "mnemo.pullMode"]).also_ok(1))?;
        let mode = out.text();
        Ok(match mode.as_str() {
            "fetch" | "merge" | "ffOnly" | "rebase" => mode,
            _ => "merge".into(),
        })
    }

    pub fn set_pull_mode(&self, mode: &str) -> Result<()> {
        if !matches!(mode, "fetch" | "merge" | "ffOnly" | "rebase") {
            return Err(CoreError::invalid("modo de pull inválido"));
        }
        self.run(["config", "--local", "mnemo.pullMode", mode])
    }

    pub fn progress_steps(&self) -> Option<(u32, u32)> {
        let dir = self.git_dir().ok()?;
        for (folder, current, total) in [("rebase-merge", "msgnum", "end"), ("rebase-apply", "next", "last")] {
            let path = dir.join(folder);
            if path.is_dir() {
                let read = |name: &str| std::fs::read_to_string(path.join(name)).ok()?.trim().parse().ok();
                return Some((read(current)?, read(total)?));
            }
        }
        None
    }

    /// Branches remotas (remoto, nome) em ordem alfabética, sem o `<remoto>/HEAD` simbólico.
    pub fn remote_branches(&self) -> Result<Vec<(String, String)>> {
        let remotes = self.remotes()?;
        let out = self.text(["for-each-ref", "--sort=refname", "--format=%(refname)%00%(symref)", "refs/remotes"])?;
        Ok(out
            .lines()
            .filter_map(|l| {
                let (full, symref) = l.split_once('\0')?;
                let full = full.strip_prefix("refs/remotes/").filter(|_| symref.is_empty())?;
                // o nome do remoto pode ter "/": casa pelo remoto conhecido mais longo
                let remote = remotes.iter().filter(|r| full.starts_with(&format!("{r}/"))).max_by_key(|r| r.len())?;
                Some((remote.clone(), full[remote.len() + 1..].to_string()))
            })
            .collect())
    }

    pub fn stash_list(&self) -> Result<Vec<StashEntry>> {
        let out = self.exec(&GitCmd::new(["stash", "list", "--format=%H%x00%gs"]))?;
        Ok(out
            .text()
            .lines()
            .filter_map(|l| l.split_once('\0'))
            .map(|(sha, msg)| StashEntry { sha: sha.into(), message: msg.into() })
            .collect())
    }

    /// Apaga todas as refs `refs/mnemo/<id>/…` de uma Operação.
    pub fn delete_pinned(&self, op_id: u64) {
        let prefix = format!("refs/mnemo/{op_id}/");
        let Ok(listing) = self.text(["for-each-ref", "--format=%(refname)", &prefix]) else { return };
        let mut stdin = String::new();
        for r in listing.lines().filter(|l| !l.is_empty()) {
            stdin.push_str(&format!("delete {r}\0\0"));
        }
        if !stdin.is_empty() {
            let _ = self.exec(&GitCmd::new(["update-ref", "--stdin", "-z"]).stdin(stdin.into_bytes()));
        }
    }

    pub fn branch_ref(name: &str) -> String {
        format!("{BRANCH_PREFIX}{name}")
    }

    /// Variáveis para commits internos do Mnemo (snapshots) não dependerem de `user.*`.
    pub fn internal_identity(cmd: GitCmd) -> GitCmd {
        cmd.env("GIT_AUTHOR_NAME", "Mnemo")
            .env("GIT_AUTHOR_EMAIL", "mnemo@localhost")
            .env("GIT_COMMITTER_NAME", "Mnemo")
            .env("GIT_COMMITTER_EMAIL", "mnemo@localhost")
    }
}

fn join<T>(h: std::thread::ScopedJoinHandle<'_, T>) -> Result<T> {
    h.join().map_err(|_| CoreError::internal("thread de leitura do git entrou em pânico"))
}

/// Erro tipado a partir de uma saída não-zero do git (reconhece o `index.lock` de outro processo).
pub fn failure(cmd: &GitCmd, out: &GitOutput) -> CoreError {
    if out.stderr.contains("index.lock") && out.stderr.contains("File exists") {
        return CoreError::IndexLocked;
    }
    CoreError::GitFailed { args: cmd.args.join(" "), status: out.code, stderr: out.stderr.trim().to_string() }
}
