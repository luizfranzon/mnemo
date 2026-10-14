use super::{ExecCtx, Handler, HandlerOutcome};
use crate::application::git::RepoGit;
use crate::application::ports::GitCmd;
use crate::application::wip::{in_paths, stash_files};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, StashPlan, UndoPlan, WipPlan};

/// Criar (inteiro ou parcial), aplicar (inteiro ou parte), pop e excluir stash. Desfazer troca o WIP de volta e
/// refaz a pilha de stashes.
pub struct StashHandler;

impl Handler for StashHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(kind, StashCreate { .. } | StashApply { .. } | StashPop { .. } | StashDrop { .. } | StashApplyPaths { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        use OperationKind::*;
        let git = ctx.git;
        let list_before = git.stash_list()?;
        let touches_wip = !matches!(kind, StashDrop { .. });
        let wip_before = if touches_wip { Some(git.wip_tree()?) } else { None };

        match kind {
            StashCreate { message, include_untracked, paths } => {
                let mut args = vec!["stash".to_string(), "push".into()];
                if *include_untracked {
                    args.push("-u".into());
                }
                if let Some(m) = message.as_ref().filter(|m| !m.trim().is_empty()) {
                    args.extend(["-m".into(), m.clone()]);
                }
                // o git recusa qualquer stash com arquivo em conflito no index: avisa quais são
                let conflicted = conflicted(git)?;
                if !conflicted.is_empty() {
                    let picked: Vec<String> = conflicted.iter().filter(|c| paths.is_empty() || in_paths(c, paths)).cloned().collect();
                    return Err(CoreError::StashConflicted { paths: if picked.is_empty() { conflicted } else { picked } });
                }
                if !paths.is_empty() {
                    args.push("--".into());
                    args.extend(paths.iter().cloned());
                }
                git.run(args)?;
            }
            StashApplyPaths { index, paths } => {
                let entry = list_before
                    .get(*index)
                    .ok_or_else(|| CoreError::invalid(format!("stash@{{{index}}} não existe")))?;
                apply_paths(git, &entry.sha, paths)?;
            }
            StashApply { index } | StashPop { index } | StashDrop { index } => {
                let verb = match kind {
                    StashApply { .. } => "apply",
                    StashPop { .. } => "pop",
                    _ => "drop",
                };
                let entry = list_before
                    .get(*index)
                    .ok_or_else(|| CoreError::invalid(format!("stash@{{{index}}} não existe")))?;
                if verb != "apply" {
                    // O stash removido fica preso a um ref próprio até a Operação sair do histórico.
                    git.run(["update-ref", format!("refs/mnemo/{}/stash", ctx.op_id).as_str(), entry.sha.as_str()])?;
                }
                git.run(["stash", verb, format!("stash@{{{index}}}").as_str()])?;
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        }

        let list_after = git.stash_list()?;
        if matches!(kind, StashCreate { .. }) && list_after.len() == list_before.len() {
            return Err(CoreError::NothingToDo { reason: "não há mudanças para guardar no stash".into() });
        }

        let mut plan = UndoPlan::default();
        if list_after != list_before {
            plan.stash = Some(StashPlan { before: list_before, after: list_after });
        }
        if let Some(before_tree) = wip_before {
            plan.wip = Some(WipPlan::Replace {
                before_tree,
                after_tree: git.wip_tree()?,
                before_index: ctx.before.index_tree.clone(),
                after_index: git.index_tree()?,
            });
        }
        Ok(HandlerOutcome::Done(plan))
    }
}

/// Só os arquivos que o stash mudou dentro de `paths` (uma pasta não traz de volta o resto dela).
fn apply_paths(git: &RepoGit, sha: &str, paths: &[String]) -> Result<()> {
    let files: Vec<_> = stash_files(git, sha)?.into_iter().filter(|(f, _)| in_paths(&f.path, paths)).collect();
    if files.is_empty() {
        return Err(CoreError::NothingToDo { reason: "nenhum desses arquivos está no stash".into() });
    }
    let (mut tracked, mut untracked) = (Vec::new(), Vec::new());
    for (file, from_untracked) in files {
        if file.status == "D" {
            let target = git.workdir().join(&file.path);
            if target.exists() {
                std::fs::remove_file(target)?;
            }
        } else if from_untracked {
            untracked.push(file.path);
        } else {
            tracked.push(file.path);
        }
    }
    for (source, list) in [(sha.to_string(), tracked), (format!("{sha}^3"), untracked)] {
        if list.is_empty() {
            continue;
        }
        let mut args = vec!["--literal-pathspecs".to_string(), "restore".into(), format!("--source={source}"), "--worktree".into(), "--".into()];
        args.extend(list);
        git.run(args)?;
    }
    Ok(())
}

fn conflicted(git: &RepoGit) -> Result<Vec<String>> {
    let out = git.exec(&GitCmd::new(["diff", "--name-only", "-z", "--diff-filter=U"]))?;
    Ok(out.stdout.split(|b| *b == 0).filter(|p| !p.is_empty()).map(|p| String::from_utf8_lossy(p).into_owned()).collect())
}
