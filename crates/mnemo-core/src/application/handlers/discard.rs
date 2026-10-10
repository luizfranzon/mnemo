use super::{ExecCtx, Handler, HandlerOutcome};
use crate::application::snapshot;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, UndoPlan, WipPlan};

pub struct DiscardHandler;

impl Handler for DiscardHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        matches!(kind, OperationKind::Discard { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        let OperationKind::Discard { paths } = kind else {
            return Err(CoreError::internal("kind fora do handler"));
        };
        let git = ctx.git;
        if git.wip_tree()? == git.head_tree() {
            return Err(CoreError::NothingToDo { reason: "não há mudanças para descartar".into() });
        }
        let preview = snapshot::preview(git, paths, ctx.snapshot_limit)?;
        let plan = if preview.exceeds_limit {
            ctx.warnings.push("Mudanças grandes demais para guardar: o descarte não poderá ser desfeito".into());
            UndoPlan::irreversible("descarte sem snapshot (arquivos grandes demais)")
        } else {
            snapshot::capture(git, ctx.op_id)?;
            UndoPlan {
                wip: Some(WipPlan::Discard { paths: paths.clone(), pin_ref: snapshot::pin_ref(ctx.op_id) }),
                ..UndoPlan::default()
            }
        };
        snapshot::discard_changes(git, paths)?;
        Ok(HandlerOutcome::Done(plan))
    }
}
