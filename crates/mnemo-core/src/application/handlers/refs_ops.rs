use super::{ExecCtx, Handler, HandlerOutcome};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, RefsStrategy, UndoPlan};

/// Checkout, commit, branches e tags locais: só movem refs/HEAD.
pub struct RefsOps;

impl Handler for RefsOps {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(
            kind,
            Checkout { .. }
                | Commit { .. }
                | BranchCreate { .. }
                | BranchRename { .. }
                | BranchDelete { .. }
                | TagCreate { .. }
                | TagDelete { .. }
        )
    }

    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        use OperationKind::*;
        let git = ctx.git;
        let strategy = match kind {
            Checkout { target } => {
                require(target, "alvo do checkout")?;
                git.run(["checkout", target.as_str(), "--"])?;
                RefsStrategy::Checkout
            }
            Commit { message, amend, allow_empty } => {
                let mut args = vec!["commit".to_string()];
                if *amend {
                    args.push("--amend".into());
                }
                if message.trim().is_empty() {
                    if !*amend {
                        return Err(CoreError::invalid("a mensagem do commit está vazia"));
                    }
                    args.push("--no-edit".into());
                } else {
                    args.extend(["-m".into(), message.clone()]);
                }
                if *allow_empty {
                    args.push("--allow-empty".into());
                }
                git.run(args)?;
                RefsStrategy::RefsIndex
            }
            BranchCreate { name, start, checkout } => {
                require(name, "nome da branch")?;
                let mut args = vec![if *checkout { "switch" } else { "branch" }.to_string()];
                if *checkout {
                    args.push("-c".into());
                }
                args.push(name.clone());
                args.extend(start.clone());
                git.run(args)?;
                if *checkout {
                    RefsStrategy::Checkout
                } else {
                    RefsStrategy::Refs
                }
            }
            BranchRename { from, to } => {
                require(to, "novo nome da branch")?;
                git.run(["branch", "-m", from.as_str(), to.as_str()])?;
                RefsStrategy::Refs
            }
            BranchDelete { name, force } => {
                git.run(["branch", if *force { "-D" } else { "-d" }, name.as_str()])?;
                RefsStrategy::Refs
            }
            TagCreate { name, target, message } => {
                require(name, "nome da tag")?;
                let mut args = vec!["tag".to_string()];
                if let Some(m) = message {
                    args.extend(["-a".into(), "-m".into(), m.clone()]);
                }
                args.push(name.clone());
                args.extend(target.clone());
                git.run(args)?;
                RefsStrategy::Refs
            }
            TagDelete { name } => {
                git.run(["tag", "-d", name.as_str()])?;
                RefsStrategy::Refs
            }
            _ => return Err(CoreError::internal("kind fora do handler")),
        };
        Ok(HandlerOutcome::Done(UndoPlan::refs(strategy)))
    }
}

fn require(value: &str, what: &str) -> Result<()> {
    if value.trim().is_empty() {
        Err(CoreError::invalid(format!("{what} está vazio")))
    } else {
        Ok(())
    }
}
