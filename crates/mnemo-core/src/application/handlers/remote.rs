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
            Push { remote, branch, set_upstream, lease } => {
                let mut a = vec!["push".to_string()];
                if let Some(sha) = lease {
                    let branch = match branch {
                        Some(b) => b.clone(),
                        None => current_branch(ctx)?,
                    };
                    let remote = match remote {
                        Some(r) => r.clone(),
                        None => default_remote(ctx)?,
                    };
                    let target = remote_branch(ctx, &branch, &remote);
                    a.extend([format!("--force-with-lease={target}:{sha}"), remote, format!("{branch}:{target}")]);
                } else if *set_upstream {
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
            Fetch { remote, prune } => {
                let mut a = vec!["fetch".to_string(), if *prune { "--prune" } else { "--no-prune" }.into()];
                a.push(remote.clone().unwrap_or_else(|| "--all".into()));
                a
            }
            DeleteRemoteBranch { remote, branch } => {
                vec!["push".into(), remote.clone(), "--delete".into(), branch.clone()]
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        };
        match ctx.git.exec(&GitCmd::new(args).timeout(NETWORK_TIMEOUT)) {
            Err(CoreError::GitFailed { stderr, .. }) if matches!(kind, Push { lease: None, .. }) && is_rejection(&stderr) => {
                let branch = ctx.before.branch_name().unwrap_or("HEAD").to_string();
                let upstream = ctx.git.text(["rev-parse", "--abbrev-ref", "@{u}"]).unwrap_or_else(|_| format!("origin/{branch}"));
                return Err(CoreError::PushRejected { branch, upstream });
            }
            other => other?,
        };
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

/// O remoto recusou por a branch local estar atrás (o git roda com LC_ALL=C, então o texto é estável).
fn is_rejection(stderr: &str) -> bool {
    stderr.contains("[rejected]") && (stderr.contains("non-fast-forward") || stderr.contains("fetch first"))
}

/// Nome da branch no remoto: o do upstream configurado, se for deste remoto; senão o próprio nome local.
fn remote_branch(ctx: &ExecCtx, branch: &str, remote: &str) -> String {
    ctx.git
        .text(["config", "--get", &format!("branch.{branch}.merge")])
        .ok()
        .filter(|_| ctx.git.text(["config", "--get", &format!("branch.{branch}.remote")]).ok().as_deref() == Some(remote))
        .and_then(|m| m.strip_prefix("refs/heads/").map(str::to_string))
        .unwrap_or_else(|| branch.to_string())
}
