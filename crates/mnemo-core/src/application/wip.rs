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

/// `paths` vazio = todos.
pub fn stage(git: &RepoGit, paths: &[String], on: bool) -> Result<()> {
    let mut args: Vec<String> = if on { vec!["add".into(), "-A".into()] } else { vec!["reset".into(), "-q".into()] };
    args.push("--".into());
    if paths.is_empty() {
        args.push(".".into());
    } else {
        args.extend(paths.iter().cloned());
    }
    git.run(args)
}
