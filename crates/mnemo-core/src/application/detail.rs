//! Detalhe de um commit: cabeçalho, pais e arquivos com status e +/−, prontos para a UI.
use crate::application::git::RepoGit;
use crate::application::ports::GitCmd;
use crate::domain::error::{CoreError, Result};
use serde::Serialize;
use std::collections::HashMap;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FileChange {
    pub path: String,
    /// Caminho antigo, só em renomeação/cópia.
    pub old_path: Option<String>,
    /// `A` adicionado, `M` modificado, `D` removido, `R` renomeado, `C` copiado, `T` tipo, `U` sem mudança (só em "todos os arquivos").
    pub status: String,
    /// `None` em binário.
    pub added: Option<u64>,
    pub removed: Option<u64>,
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CommitDetail {
    pub sha: String,
    pub parents: Vec<String>,
    pub author: String,
    pub email: String,
    pub timestamp: i64,
    pub subject: String,
    pub body: String,
    pub files: Vec<FileChange>,
    pub added: u64,
    pub removed: u64,
}

const EMPTY_TREE: &str = "4b825dc642cb6eb9a060e54bf8d69288fbee4904";

/// `all` inclui também os arquivos que o commit não tocou (status `U`).
pub fn load(git: &RepoGit, rev: &str, all: bool) -> Result<CommitDetail> {
    let sha = git.rev_parse(rev).map_err(|_| CoreError::invalid(format!("commit inexistente: {rev}")))?;
    let head = git.exec(&GitCmd::new(["show", "-s", "--format=%H%x00%P%x00%an%x00%ae%x00%at%x00%s%x00%b", &sha]))?;
    let text = String::from_utf8_lossy(&head.stdout).into_owned();
    let mut f = text.splitn(7, '\0');
    let mut next = || f.next().unwrap_or_default().to_string();
    let (_, parents, author, email, at, subject, body) = (next(), next(), next(), next(), next(), next(), next());
    let parents: Vec<String> = parents.split_whitespace().map(str::to_string).collect();

    // merge e commit raiz comparam com o primeiro pai / árvore vazia, sempre em um só diff
    let base = parents.first().map_or(EMPTY_TREE, String::as_str);
    let diff = |flag: &str| git.exec(&GitCmd::new(["diff-tree", "-r", "-M", "-z", flag, "--no-commit-id", base, &sha]));
    let (status, numstat) = std::thread::scope(|s| {
        let n = s.spawn(|| diff("--numstat"));
        (diff("--name-status"), n.join().expect("numstat"))
    });

    let mut files = parse_name_status(&status?.stdout);
    let stats = parse_numstat(&numstat?.stdout);
    let (mut added, mut removed) = (0, 0);
    for file in &mut files {
        if let Some((a, r)) = stats.get(&file.path) {
            (file.added, file.removed) = (*a, *r);
            added += a.unwrap_or(0);
            removed += r.unwrap_or(0);
        }
    }
    if all {
        let tree = git.exec(&GitCmd::new(["ls-tree", "-r", "-z", "--name-only", &sha]))?;
        let touched: std::collections::HashSet<String> = files.iter().map(|f| f.path.clone()).collect();
        for path in tree.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()) {
            let path = String::from_utf8_lossy(path).into_owned();
            if !touched.contains(&path) {
                files.push(FileChange { path, old_path: None, status: "U".into(), added: None, removed: None });
            }
        }
    }
    Ok(CommitDetail {
        sha,
        parents,
        author,
        email,
        timestamp: at.parse().unwrap_or(0),
        subject,
        body: body.trim().to_string(),
        files,
        added,
        removed,
    })
}

fn tokens(bytes: &[u8]) -> impl Iterator<Item = String> + '_ {
    bytes.split(|b| *b == 0).filter(|t| !t.is_empty()).map(|t| String::from_utf8_lossy(t).into_owned())
}

/// `-z`: `M\0caminho\0` ou `R100\0antigo\0novo\0`.
fn parse_name_status(bytes: &[u8]) -> Vec<FileChange> {
    let mut it = tokens(bytes);
    let mut files = Vec::new();
    while let Some(code) = it.next() {
        let status = code[..1].to_string();
        let (old_path, path) = if matches!(status.as_str(), "R" | "C") {
            let old = it.next();
            (old, it.next().unwrap_or_default())
        } else {
            (None, it.next().unwrap_or_default())
        };
        files.push(FileChange { path, old_path, status, added: None, removed: None });
    }
    files
}

/// `-z`: `12\t3\tcaminho\0` ou, em renomeação, `12\t3\t\0antigo\0novo\0`. Binário traz `-`.
fn parse_numstat(bytes: &[u8]) -> HashMap<String, (Option<u64>, Option<u64>)> {
    let mut it = bytes.split(|b| *b == 0).filter(|t| !t.is_empty());
    let mut stats = HashMap::new();
    while let Some(head) = it.next() {
        let head = String::from_utf8_lossy(head);
        let mut parts = head.splitn(3, '\t');
        let (a, r, inline) = (parts.next().unwrap_or("-"), parts.next().unwrap_or("-"), parts.next().unwrap_or(""));
        let path = if inline.is_empty() {
            it.next();
            String::from_utf8_lossy(it.next().unwrap_or_default()).into_owned()
        } else {
            inline.to_string()
        };
        stats.insert(path, (a.parse().ok(), r.parse().ok()));
    }
    stats
}
