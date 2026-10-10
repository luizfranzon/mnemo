use super::{ExecCtx, Handler, HandlerOutcome};
use crate::application::snapshot;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, RefsPlan, RefsStrategy, ResetMode, UndoPlan, WipPlan};

pub struct ResetHandler;

impl Handler for ResetHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        matches!(kind, OperationKind::Reset { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        let OperationKind::Reset { target, mode } = kind else {
            return Err(CoreError::internal("kind fora do handler"));
        };
        let git = ctx.git;
        if *mode != ResetMode::Hard {
            git.run(["reset", mode.flag(), target.as_str()])?;
            return Ok(HandlerOutcome::Done(UndoPlan::refs(RefsStrategy::RefsIndex)));
        }

        // Reset hard: o WIP que ele vai levar fica num snapshot recuperável.
        let dirty = git.wip_tree()? != git.head_tree();
        let mut plan = UndoPlan::refs(RefsStrategy::Keep);
        if dirty {
            let (_, _, bytes) = untracked_totals(ctx)?;
            if bytes > ctx.snapshot_limit {
                ctx.warnings.push("O WIP é grande demais para guardar: o reset hard não poderá ser desfeito".into());
                plan = UndoPlan::irreversible("reset hard sem snapshot (arquivos grandes demais)");
            } else {
                snapshot::capture(ctx.git, ctx.op_id)?;
                plan.refs = Some(RefsPlan { undo: RefsStrategy::Keep, redo: RefsStrategy::Hard });
                plan.wip = Some(WipPlan::Discard { paths: vec![], pin_ref: snapshot::pin_ref(ctx.op_id) });
            }
        }
        ctx.git.run(["reset", "--hard", target.as_str()])?;
        Ok(HandlerOutcome::Done(plan))
    }
}

fn untracked_totals(ctx: &ExecCtx) -> Result<(usize, usize, u64)> {
    let p = snapshot::preview(ctx.git, &[], ctx.snapshot_limit)?;
    Ok((p.tracked_changes, p.untracked_files, p.untracked_bytes))
}
