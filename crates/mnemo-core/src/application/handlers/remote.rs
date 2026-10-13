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
                    // `push -u` sem alvo falha: publica a branch atual no origin (ou no único remoto)
                    let branch = match branch {
                        Some(b) => b.clone(),
                        None => current_branch(ctx)?,
                    };
                    let remote = match remote {
                        Some(r) => r.clone(),
                        None => default_remote(ctx)?,
                    };
                    a.extend(["-u".into(), remote, branch]);
                } else {
                    a.extend(remote.clone());
                    a.extend(branch.clone());
                }
                a
            }
            Fetch { remote } => {
                let mut a = vec!["fetch".to_string(), "--prune".into()];
                a.push(remote.clone().unwrap_or_else(|| "--all".into()));
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

fn current_branch(ctx: &ExecCtx) -> Result<String> {
    ctx.before
        .branch_name()
        .map(str::to_string)
        .ok_or_else(|| CoreError::invalid("HEAD destacado: crie uma branch antes de definir o upstream"))
}

fn default_remote(ctx: &ExecCtx) -> Result<String> {
    let mut remotes = ctx.git.remotes()?;
    if remotes.iter().any(|r| r == "origin") {
        return Ok("origin".into());
    }
    match remotes.len() {
        1 => Ok(remotes.remove(0)),
        0 => Err(CoreError::invalid("Nenhum remoto configurado")),
        _ => Err(CoreError::invalid("Escolha o remoto para definir o upstream")),
    }
}
