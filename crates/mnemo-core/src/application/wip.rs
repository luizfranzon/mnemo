//! WIP: arquivos não preparados e preparados, e preparar/tirar. Preparar não é Operação (CONTEXT.md).
use crate::application::detail::{parse_numstat, FileChange};
use crate::application::git::RepoGit;
use crate::application::ports::GitCmd;
use crate::domain::error::Result;
use serde::Serialize;

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WipStatus {
    pub unstaged: Vec<FileChange>,
    pub staged: Vec<FileChange>,
}

pub fn status(git: &RepoGit) -> Result<WipStatus> {
    let out = git.exec(&GitCmd::new(["status", "--porcelain=v1", "-z", "--untracked-files=all"]))?;
    let (mut unstaged, mut staged) = (Vec::new(), Vec::new());
    let mut entries = out.stdout.split(|b| *b == 0).filter(|p| !p.is_empty());
    while let Some(entry) = entries.next() {
        if entry.len() < 4 {
            continue;
        }
        let (x, y) = (entry[0] as char, entry[1] as char);
        // arquivos não mesclados vêm de `conflict::list`
        if x == 'U' || y == 'U' || (x == y && matches!(x, 'A' | 'D')) {
            continue;
        }
        let path = String::from_utf8_lossy(&entry[3..]).into_owned();
        let old = (matches!(x, 'R' | 'C') || matches!(y, 'R' | 'C')).then(|| entries.next().map(|o| String::from_utf8_lossy(o).into_owned())).flatten();
        let file = |code: char, old_path: Option<String>| FileChange {
            path: path.clone(),
            old_path,
            status: code.to_string(),
            added: None,
            removed: None,
        };
        if x == '?' {
            unstaged.push(file('A', None));
            continue;
        }
        if x != ' ' && x != 'U' {
            staged.push(file(x, old.clone().filter(|_| matches!(x, 'R' | 'C'))));
        }
        if y != ' ' {
            unstaged.push(file(if y == '?' { 'A' } else { y }, old.filter(|_| matches!(y, 'R' | 'C'))));
        }
    }
    for (files, cached) in [(&mut staged, true), (&mut unstaged, false)] {
        let args: Vec<&str> = if cached { vec!["diff", "--cached", "--numstat", "-z"] } else { vec!["diff", "--numstat", "-z"] };
        let stats = parse_numstat(&git.exec(&GitCmd::new(args))?.stdout);
        for f in files.iter_mut() {
            if let Some((a, r)) = stats.get(&f.path) {
                (f.added, f.removed) = (*a, *r);
            }
        }
    }
    Ok(WipStatus { unstaged, staged })
}

/// `paths` vazio = todos. Arquivo em conflito que ainda tem marcadores não é marcado como resolvido:
/// os demais são preparados e o erro nomeia os que ficaram de fora.
pub fn stage(git: &RepoGit, paths: &[String], on: bool) -> Result<()> {
    let bad = if on { crate::application::conflict::with_markers(git, paths)? } else { Vec::new() };
    let mut args: Vec<String> = if on { vec!["add".into(), "-A".into()] } else { vec!["reset".into(), "-q".into()] };
    args.push("--".into());
    let targets: Vec<String> = if paths.is_empty() { vec![".".into()] } else { paths.iter().filter(|p| !bad.contains(p)).cloned().collect() };
    if !targets.is_empty() {
        args.extend(targets);
        args.extend(bad.iter().map(|f| format!(":(exclude,literal){f}")));
        git.run(args)?;
    }
    if bad.is_empty() {
        return Ok(());
    }
    Err(crate::domain::error::CoreError::invalid(format!("marcadores de conflito em: {}", bad.join(", "))))
}

/// Acrescenta `pattern` ao `.gitignore` da raiz (se ainda não estiver lá). Não é Operação: é uma edição de arquivo.
pub fn ignore(git: &RepoGit, pattern: &str) -> Result<()> {
    let pattern = pattern.trim();
    if pattern.is_empty() || pattern.contains(['\n', '\r']) {
        return Err(crate::domain::error::CoreError::invalid("padrão de .gitignore inválido"));
    }
    let file = git.workdir().join(".gitignore");
    // só a falta do arquivo vira texto vazio: qualquer outro erro não pode acabar reescrevendo o .gitignore
    let mut text = match std::fs::read_to_string(&file) {
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => String::new(),
        other => other?,
    };
    if text.lines().any(|l| l.trim() == pattern) {
        return Ok(());
    }
    if !text.is_empty() && !text.ends_with('\n') {
        text.push('\n');
    }
    text.push_str(pattern);
    text.push('\n');
    std::fs::write(file, text)?;
    Ok(())
}

/// Arquivos de um stash: os rastreados (contra a base do stash) e os não rastreados que ele guardou (`A`).
/// O `bool` diz se veio da parte não rastreada (`stash^3`).
pub fn stash_files(git: &RepoGit, sha: &str) -> Result<Vec<(FileChange, bool)>> {
    let base = format!("{sha}^1");
    let tracked = git.exec(&GitCmd::new(["diff-tree", "-r", "-z", "--no-renames", "--name-status", &base, sha]))?;
    let mut files: Vec<(FileChange, bool)> =
        crate::application::detail::parse_name_status(&tracked.stdout).into_iter().map(|f| (f, false)).collect();
    let third = format!("{sha}^3");
    if git.exec(&GitCmd::new(["rev-parse", "-q", "--verify", &third]).also_ok(1))?.code == 0 {
        let out = git.exec(&GitCmd::new(["ls-tree", "-r", "-z", "--name-only", &third]))?;
        for p in out.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()) {
            let path = String::from_utf8_lossy(p).into_owned();
            files.push((FileChange { path, old_path: None, status: "A".into(), added: None, removed: None }, true));
        }
    }
    Ok(files)
}

/// `path` é o próprio arquivo ou uma pasta que o contém.
pub fn in_paths(file: &str, paths: &[String]) -> bool {
    paths.iter().any(|p| {
        let p = p.trim_end_matches('/');
        file == p || file.strip_prefix(p).is_some_and(|rest| rest.starts_with('/'))
    })
}
