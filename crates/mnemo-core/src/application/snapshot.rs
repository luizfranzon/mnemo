//! Snapshot do WIP preso em `refs/mnemo/<id>/wip`, para Descartar e Reset hard serem desfazíveis.

use super::git::RepoGit;
use super::ports::GitCmd;
use super::restore::{apply_tree_diff, snapshot_base_tree};
use crate::domain::error::{CoreError, Result};
use serde::Serialize;
use std::path::Path;

/// Acima disso, o descarte avisa e segue sem snapshot.
pub const SNAPSHOT_SIZE_LIMIT: u64 = 256 * 1024 * 1024;
pub const COPY_SUFFIX: &str = ".mnemo-restaurado";

pub fn pin_ref(op_id: u64) -> String {
    format!("refs/mnemo/{op_id}/wip")
}

#[derive(Clone, Debug, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DiscardPreview {
    pub tracked_changes: usize,
    pub untracked_files: usize,
    pub untracked_bytes: u64,
    /// `true` quando o descarte seguiria sem snapshot (não desfazível).
    pub exceeds_limit: bool,
}

/// Quanto seria descartado e se cabe no snapshot.
pub fn preview(git: &RepoGit, paths: &[String], limit: u64) -> Result<DiscardPreview> {
    let tracked = git
        .exec(&scoped(GitCmd::new(["status", "--porcelain=v1", "-z", "--untracked-files=no"]), paths))?
        .stdout
        .split(|b| *b == 0)
        .filter(|e| !e.is_empty())
        .count();
    let (untracked_files, untracked_bytes) = untracked_size(git, paths)?;
    Ok(DiscardPreview {
        tracked_changes: tracked,
        untracked_files,
        untracked_bytes,
        exceeds_limit: untracked_bytes > limit,
    })
}

fn scoped(mut cmd: GitCmd, paths: &[String]) -> GitCmd {
    if !paths.is_empty() {
        cmd.args.push("--".into());
        cmd.args.extend(paths.iter().cloned());
    }
    cmd
}

fn untracked_size(git: &RepoGit, paths: &[String]) -> Result<(usize, u64)> {
    let out = git.exec(&scoped(GitCmd::new(["ls-files", "-o", "--exclude-standard", "-z"]), paths))?;
    let mut files = 0usize;
    let mut bytes = 0u64;
    for rel in out.stdout.split(|b| *b == 0).filter(|e| !e.is_empty()) {
        files += 1;
        let rel = String::from_utf8_lossy(rel).to_string();
        bytes += std::fs::metadata(git.workdir().join(rel)).map(|m| m.len()).unwrap_or(0);
    }
    Ok((files, bytes))
}

/// Grava o WIP atual (árvore de trabalho completa) num commit preso a `refs/mnemo/<id>/wip`.
pub fn capture(git: &RepoGit, op_id: u64) -> Result<String> {
    let tree = git.wip_tree()?;
    let mut args = vec!["commit-tree".to_string(), tree, "-m".into(), format!("mnemo wip {op_id}")];
    if let Some(head) = git.head_sha() {
        args.push("-p".into());
        args.push(head);
    }
    let commit = RepoGit::internal_identity(GitCmd::new(args));
    let sha = git.exec(&commit)?.text();
    git.run(["update-ref", pin_ref(op_id).as_str(), sha.as_str()])?;
    Ok(sha)
}

/// `true` quando não há snapshot ou o WIP atual ainda é o que foi guardado (nada foi descartado).
pub fn untouched_since_capture(git: &RepoGit, op_id: u64) -> bool {
    let Ok(saved) = git.text(["rev-parse", "-q", "--verify", &format!("{}^{{tree}}", pin_ref(op_id))]) else {
        return true;
    };
    git.wip_tree().map(|now| now == saved).unwrap_or(false)
}

/// Descarta as mudanças dos `paths` (vazio = tudo): index, árvore de trabalho e untracked.
pub fn discard_changes(git: &RepoGit, paths: &[String]) -> Result<()> {
    git.exec(&scoped(GitCmd::new(["reset", "-q"]), paths).also_ok(1))?;
    let modified = git.exec(&scoped(GitCmd::new(["ls-files", "-z", "-m", "-d"]), paths))?;
    if !modified.stdout.is_empty() {
        git.exec(&GitCmd::new(["checkout-index", "-f", "-z", "--stdin"]).stdin(modified.stdout))?;
    }
    git.exec(&scoped(GitCmd::new(["clean", "-fdq"]), paths))?;
    Ok(())
}

/// Merge de 3 vias do snapshot contra o WIP atual. Conflito: nada muda.
pub fn restore(git: &RepoGit, op_id: u64, snapshot_commit: &str) -> Result<()> {
    let base = snapshot_base_tree(git, snapshot_commit);
    let theirs = git.text(["rev-parse", &format!("{snapshot_commit}^{{tree}}")])?;
    let ours = git.wip_tree()?;
    if ours == theirs {
        return Ok(());
    }
    let merge = git.exec(
        &GitCmd::new(["merge-tree", "--write-tree", "--name-only", &format!("--merge-base={base}"), &ours, &theirs])
            .also_ok(1),
    )?;
    let text = merge.text();
    let mut lines = text.lines();
    let merged = lines.next().unwrap_or_default().to_string();
    if merge.code == 1 {
        let paths: Vec<String> = lines.take_while(|l| !l.is_empty()).map(str::to_string).collect();
        return Err(CoreError::RestoreConflict { op_id, paths });
    }
    apply_tree_diff(git, &ours, &merged)
}

/// Plano B do conflito: grava as versões do snapshot ao lado (`arquivo.mnemo-restaurado`),
/// sem tocar nos arquivos atuais. Devolve os caminhos criados.
pub fn restore_as_copies(git: &RepoGit, snapshot_commit: &str, scope: &[String]) -> Result<Vec<String>> {
    let base = snapshot_base_tree(git, snapshot_commit);
    let theirs = git.text(["rev-parse", &format!("{snapshot_commit}^{{tree}}")])?;
    let diff = git.exec(&scoped(
        GitCmd::new(["diff-tree", "-r", "-z", "--no-renames", "--name-only", "--diff-filter=AM", &base, &theirs]),
        &[],
    ))?;
    let mut created = Vec::new();
    for rel in diff.stdout.split(|b| *b == 0).filter(|e| !e.is_empty()) {
        let rel = String::from_utf8_lossy(rel).to_string();
        if !in_scope(&rel, scope) {
            continue;
        }
        let blob = git.exec(&GitCmd::new(["cat-file", "blob", &format!("{theirs}:{rel}")]))?;
        let target = format!("{rel}{COPY_SUFFIX}");
        write_file(&git.workdir().join(&target), &blob.stdout)?;
        created.push(target);
    }
    Ok(created)
}

fn in_scope(rel: &str, scope: &[String]) -> bool {
    scope.is_empty() || scope.iter().any(|s| rel == s || rel.starts_with(&format!("{}/", s.trim_end_matches('/'))))
}

fn write_file(path: &Path, bytes: &[u8]) -> Result<()> {
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir)?;
    }
    std::fs::write(path, bytes)?;
    Ok(())
}
