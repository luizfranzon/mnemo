use super::{ExecCtx, Handler, HandlerOutcome};
use crate::application::git::{failure, ProgressKind};
use crate::application::ports::GitCmd;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, PullStrategy, RefsStrategy, UndoPlan};

/// Merge, rebase, cherry-pick, revert e pull: desfeitos de uma vez (reset --keep ao "antes").
pub struct IntegrateHandler;

impl Handler for IntegrateHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(kind, Merge { .. } | Rebase { .. } | CherryPick { .. } | Revert { .. } | Pull { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        use OperationKind::*;
        let args: Vec<String> = match kind {
            Merge { target } => {
                let current = ctx.git.exec(&GitCmd::new(["symbolic-ref", "-q", "--short", "HEAD"]).also_ok(1)).ok().filter(|o| o.code == 0).map_or_else(|| "HEAD".to_string(), |o| o.text());
                vec!["merge".into(), "--no-edit".into(), "-m".into(), format!("Merge {target} na {current}"), target.clone()]
            }
            Rebase { onto } => vec!["rebase".into(), onto.clone()],
            CherryPick { commit } => vec!["cherry-pick".into(), commit.clone()],
            Revert { commit } => vec!["revert".into(), "--no-edit".into(), commit.clone()],
            Pull { strategy } => {
                let mut a = vec!["pull".to_string(), "--no-edit".into()];
                a.extend(strategy.map(|s| {
                    match s {
                        PullStrategy::Merge => "--no-rebase",
                        PullStrategy::Rebase => "--rebase",
                        PullStrategy::FfOnly => "--ff-only",
                    }
                    .to_string()
                }));
                a
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        };
        let mut cmd = GitCmd::new(args).also_ok(1);
        if matches!(kind, Pull { .. }) {
            cmd = cmd.timeout(crate::application::NETWORK_TIMEOUT);
        }
        let out = ctx.git.exec(&cmd)?;
        let plan = UndoPlan::refs(RefsStrategy::Keep);
        if out.code == 0 {
            return Ok(HandlerOutcome::Done(plan));
        }
        match ctx.git.in_progress() {
            Some(kind) => Ok(HandlerOutcome::Conflict { kind, plan }),
            None => Err(failure(&cmd, &out)),
        }
    }
}

/// Continua (`--continue`) ou aborta (`--abort`) uma Operação parada em conflito.
pub fn progress_command(kind: ProgressKind, action: &str) -> GitCmd {
    let mut cmd = GitCmd::new([kind.subcommand().to_string(), format!("--{action}")]).also_ok(1);
    // `merge --continue` e companhia abrem o editor; o Mnemo nunca deve esperar um.
    cmd = cmd.env("GIT_EDITOR", "true");
    cmd
}
