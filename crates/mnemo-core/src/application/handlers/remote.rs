use super::{ExecCtx, Handler, HandlerOutcome};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, UndoPlan};

use crate::application::ports::GitCmd;
use crate::application::NETWORK_TIMEOUT;

pub const REMOTE_REASON: &str = "mexe no remoto";

/// Push, fetch e excluir branch remota: rodam, entram no histórico, mas não se desfazem.
pub struct RemoteHandler;

impl Handler for RemoteHandler {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(kind, Push { .. } | Fetch { .. } | DeleteRemoteBranch { .. })
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        use OperationKind::*;
        let args: Vec<String> = match kind {
            Push { remote, branch, set_upstream } => {
                let mut a = vec!["push".to_string()];
                if *set_upstream {
                    a.push("-u".into());
                }
                a.extend(remote.clone());
                a.extend(branch.clone());
                a
            }
            Fetch { remote } => {
                let mut a = vec!["fetch".to_string(), "--prune".into()];
                a.extend(remote.clone());
                a
            }
            DeleteRemoteBranch { remote, branch } => {
                vec!["push".into(), remote.clone(), "--delete".into(), branch.clone()]
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        };
        ctx.git.exec(&GitCmd::new(args).timeout(NETWORK_TIMEOUT))?;
        Ok(HandlerOutcome::Done(UndoPlan::irreversible(REMOTE_REASON)))
    }
}
