use super::{ExecCtx, Handler, HandlerOutcome};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, StashPlan, UndoPlan, WipPlan};

/// Criar, aplicar, pop e excluir stash. Desfazer troca o WIP de volta e refaz a pilha de stashes.
pub struct StashHandler;

impl Handler for StashHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(kind, StashCreate { .. } | StashApply { .. } | StashPop { .. } | StashDrop { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        use OperationKind::*;
        let git = ctx.git;
        let list_before = git.stash_list()?;
        let touches_wip = !matches!(kind, StashDrop { .. });
        let wip_before = if touches_wip { Some(git.wip_tree()?) } else { None };

        match kind {
            StashCreate { message, include_untracked } => {
                let mut args = vec!["stash".to_string(), "push".into()];
                if *include_untracked {
                    args.push("-u".into());
                }
                if let Some(m) = message.as_ref().filter(|m| !m.trim().is_empty()) {
                    args.extend(["-m".into(), m.clone()]);
                }
                git.run(args)?;
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
