//! Mover refs, HEAD, WIP e stash de volta (Desfazer) ou adiante (Refazer).

use super::git::{RepoGit, EMPTY_TREE};
use super::ports::GitCmd;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{RefsStrategy, StashEntry};
use crate::domain::repo_state::{short_ref, RepoState};

/// Leva refs e HEAD ao estado `target` conforme a estratégia da Operação.
pub fn apply_refs(git: &RepoGit, target: &RepoState, strategy: RefsStrategy) -> Result<()> {
    let cur = git.capture_state(false)?;
    match strategy {
        RefsStrategy::Checkout => {
            // cria/move os refs que não são a branch atual, troca e acerta o resto
            restore_refs(git, &cur, target, cur.head_ref.as_deref())?;
            switch_head(git, target)?;
            restore_refs(git, &git.capture_state(false)?, target, None)
        }
        RefsStrategy::Refs | RefsStrategy::RefsIndex => {
            restore_refs(git, &cur, target, None)?;
            if cur.head_ref != target.head_ref {
                match (&target.head_ref, &target.head_sha) {
                    (Some(r), _) => git.run(["symbolic-ref", "HEAD", r.as_str()])?,
                    (None, Some(sha)) => git.run(["update-ref", "--no-deref", "HEAD", sha.as_str()])?,
                    (None, None) => return Err(CoreError::internal("HEAD alvo sem referência")),
                }
            } else if target.head_ref.is_none() && cur.head_sha != target.head_sha {
                if let Some(sha) = &target.head_sha {
                    git.run(["update-ref", "--no-deref", "HEAD", sha.as_str()])?;
                }
            }
            if strategy == RefsStrategy::RefsIndex {
                restore_index(git, target)?;
            }
            Ok(())
        }
        RefsStrategy::Keep | RefsStrategy::Hard => {
            if cur.head_ref != target.head_ref {
                // HEAD mudou de branch: troca primeiro e acerta os refs depois.
                switch_head(git, target)?;
                return restore_refs(git, &git.capture_state(false)?, target, None);
            }
            restore_refs(git, &cur, target, cur.head_ref.as_deref())?;
            let sha = target.head_sha.as_deref().ok_or_else(|| CoreError::internal("alvo sem commit"))?;
            if cur.head_sha.as_deref() != Some(sha) {
                let flag = if strategy == RefsStrategy::Hard { "--hard" } else { "--keep" };
                git.run(["reset", flag, sha])?;
            }
            Ok(())
        }
    }
}

fn restore_index(git: &RepoGit, target: &RepoState) -> Result<()> {
    if let Some(tree) = &target.index_tree {
        git.run(["read-tree", "--reset", tree.as_str()])?;
    }
    Ok(())
}

fn switch_head(git: &RepoGit, target: &RepoState) -> Result<()> {
    match (&target.head_ref, &target.head_sha) {
        (Some(r), _) => git.run(["switch", short_ref(r)]),
        (None, Some(sha)) => git.run(["switch", "--detach", sha.as_str()]),
        (None, None) => Err(CoreError::internal("HEAD alvo sem referência")),
    }
}

/// Uma transação `update-ref --stdin` para todos os refs que diferem (atômica).
fn restore_refs(git: &RepoGit, cur: &RepoState, target: &RepoState, skip: Option<&str>) -> Result<()> {
    let mut script = Vec::<u8>::new();
    for (name, oid) in &target.refs {
        if skip == Some(name.as_str()) || cur.refs.get(name) == Some(oid) {
            continue;
        }
        push_cmd(&mut script, &["update", name, oid, ""]);
    }
    for name in cur.refs.keys() {
        if skip == Some(name.as_str()) || target.refs.contains_key(name) {
            continue;
        }
        push_cmd(&mut script, &["delete", name, ""]);
    }
    if script.is_empty() {
        return Ok(());
    }
    git.exec(&GitCmd::new(["update-ref", "--stdin", "-z"]).stdin(script)).map(|_| ())
}

/// Formato `-z` do `update-ref --stdin`: `cmd SP ref NUL arg NUL ... NUL`.
fn push_cmd(buf: &mut Vec<u8>, parts: &[&str]) {
    buf.extend_from_slice(parts[0].as_bytes());
    buf.push(b' ');
    for (i, p) in parts[1..].iter().enumerate() {
        if i > 0 {
            buf.push(0);
        }
        buf.extend_from_slice(p.as_bytes());
    }
    buf.push(0);
}

/// Refaz a pilha de stash (`refs/stash` + reflog) para `target`.
pub fn restore_stash_stack(git: &RepoGit, target: &[StashEntry]) -> Result<()> {
    if git.stash_list()? == target {
        return Ok(());
    }
    git.run(["stash", "clear"])?;
    for e in target.iter().rev() {
        git.run(["stash", "store", "-m", e.message.as_str(), e.sha.as_str()])?;
    }
    Ok(())
}

/// Troca o WIP atual pela árvore `target` aplicando só a diferença (preserva o que já bate).
/// `expected_now` protege contra edições feitas depois da Operação.
pub fn replace_wip(git: &RepoGit, expected_now: &str, target_tree: &str, target_index: Option<&str>) -> Result<()> {
    let now = git.wip_tree()?;
    if now != expected_now {
        return Err(CoreError::WipChanged);
    }
    apply_tree_diff(git, &now, target_tree)?;
    if let Some(idx) = target_index {
        git.run(["read-tree", "--reset", idx])?;
    }
    Ok(())
}

/// `diff-tree --binary from to | apply`: leva o diretório de trabalho de `from` a `to`.
pub fn apply_tree_diff(git: &RepoGit, from: &str, to: &str) -> Result<()> {
    if from == to {
        return Ok(());
    }
    let patch = git.exec(&GitCmd::new(["diff-tree", "-p", "--binary", "--no-renames", "--full-index", from, to]))?;
    if patch.stdout.is_empty() {
        return Ok(());
    }
    git.exec(&GitCmd::new(["apply", "--binary", "--whitespace=nowarn", "-"]).stdin(patch.stdout)).map(|_| ())
}

/// Árvore base de um commit de snapshot (a de HEAD no momento do descarte).
pub fn snapshot_base_tree(git: &RepoGit, snapshot_commit: &str) -> String {
    git.text(["rev-parse", "-q", "--verify", &format!("{snapshot_commit}^1^{{tree}}")])
        .ok()
        .filter(|t| !t.is_empty())
        .unwrap_or_else(|| EMPTY_TREE.to_string())
}
