use super::{ExecCtx, Handler, HandlerOutcome};
use crate::application::ports::GitCmd;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{CheckoutChangesMode, OperationKind, RefsStrategy, StashPlan, UndoPlan, WipPlan};
use crate::domain::repo_state::short_ref;

/// Checkout, commit, branches e tags locais: só movem refs/HEAD.
pub struct RefsOps;

impl Handler for RefsOps {
    fn handles(&self, kind: &OperationKind) -> bool {
        use OperationKind::*;
        matches!(
            kind,
            Checkout { .. }
                | CheckoutRemote { .. }
                | CheckoutWithChanges { .. }
                | Commit { .. }
                | Reword { .. }
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
        if let CheckoutWithChanges { target, remote, mode } = kind {
            require(target, "alvo do checkout")?;
            let wip_before = git.wip_tree()?;
            let tracked_backup = if *mode == CheckoutChangesMode::Carry {
                Some(
                    git.exec(&crate::application::git::RepoGit::internal_identity(GitCmd::new(["stash", "create"])))?
                        .text(),
                )
            } else {
                None
            };
            let stash_before = if *mode == CheckoutChangesMode::Stash { Some(git.stash_list()?) } else { None };
            if *mode == CheckoutChangesMode::Stash {
                git.run(["stash", "push", "-u", "-m", &format!("Mnemo: antes de trocar para {target}")])?;
            }
            let mut args = vec!["switch".to_string()];
            if *mode == CheckoutChangesMode::Carry {
                args.push("--merge".into());
            }
            if remote.is_none()
                && (target.len() == 40 || target.len() == 64)
                && target.bytes().all(|b| b.is_ascii_hexdigit())
            {
                args.push("--detach".into());
            }
            if let Some(remote) = remote {
                args.extend(["--track".into(), "-c".into(), target.clone(), format!("{remote}/{target}")]);
            } else {
                args.push(target.clone());
            }
            if let Err(err) = git.run(args) {
                if *mode == CheckoutChangesMode::Stash {
                    if let Err(restore) = git.run(["stash", "pop"]) {
                        return Err(CoreError::internal(format!("Checkout falhou: {err}. Não foi possível restaurar o WIP: {restore}. As mudanças permanecem no stash.")));
                    }
                }
                return Err(err);
            }
            if *mode == CheckoutChangesMode::Carry && !git.text(["ls-files", "-u"])?.is_empty() {
                // `switch --merge` pode retornar sucesso com marcadores de conflito.
                // Reverte antes de registrar a Operação: o usuário ainda pode escolher Stash.
                git.run(["reset", "--hard"])?;
                if let Some(before_ref) = &ctx.before.head_ref {
                    git.run(["switch", short_ref(before_ref)])?;
                } else if let Some(sha) = &ctx.before.head_sha {
                    git.run(["switch", "--detach", sha])?;
                }
                if remote.is_some() {
                    git.run(["branch", "-D", target])?;
                }
                if let Some(backup) = tracked_backup.as_deref().filter(|s| !s.is_empty()) {
                    git.run(["stash", "apply", backup])?;
                }
                if let Some(index) = &ctx.before.index_tree {
                    git.run(["read-tree", "--reset", index])?;
                }
                return Err(CoreError::invalid(
                    "As mudanças se sobrepõem; use Stash e trocar ou resolva o conflito antes do checkout",
                ));
            }
            let mut plan = UndoPlan::refs(RefsStrategy::Checkout);
            plan.wip = Some(WipPlan::Replace {
                before_tree: wip_before,
                after_tree: git.wip_tree()?,
                before_index: ctx.before.index_tree.clone(),
                after_index: git.index_tree()?,
            });
            if let Some(before) = stash_before {
                plan.stash = Some(StashPlan { before, after: git.stash_list()? });
            }
            return Ok(HandlerOutcome::Done(plan));
        }
        let strategy = match kind {
            Checkout { target } => {
                require(target, "alvo do checkout")?;
                git.run(["checkout", target.as_str(), "--"])?;
                RefsStrategy::Checkout
            }
            CheckoutRemote { remote, branch } => {
                require(remote, "remoto")?;
                require(branch, "branch")?;
                // --track explicita o upstream mesmo se branch.autoSetupMerge estiver desligado.
                git.run(["switch", "--track", "-c", branch.as_str(), &format!("{remote}/{branch}")])?;
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
            Reword { message, commit } => {
                require(message, "mensagem do commit")?;
                let target = match commit {
                    Some(c) => git.rev_parse(c)?,
                    None => String::new(),
                };
                if target.is_empty() || Some(&target) == git.head_sha().as_ref() {
                    // `--only` sem caminhos: não leva para o commit o que está preparado.
                    git.run(["commit", "--amend", "--only", "--allow-empty", "-m", message.as_str()])?;
                } else {
                    reword_older(git, &target, message)?;
                }
                RefsStrategy::Refs
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

/// Cria o commit com a nova mensagem (mesma árvore, pais e autor) e refaz os descendentes sobre ele.
fn reword_older(git: &crate::application::git::RepoGit, target: &str, message: &str) -> Result<()> {
    let ancestor = git.exec(&GitCmd::new(["merge-base", "--is-ancestor", target, "HEAD"]).also_ok(1))?;
    if ancestor.code != 0 {
        return Err(CoreError::invalid("só dá para editar a mensagem de um commit da branch atual"));
    }
    let meta = git.text(["log", "-1", "--format=%an%x00%ae%x00%aI", target])?;
    let mut f = meta.split('\0');
    let (name, email, date) = (f.next().unwrap_or(""), f.next().unwrap_or(""), f.next().unwrap_or(""));
    let mut args = vec!["commit-tree".to_string(), format!("{target}^{{tree}}")];
    for parent in git.text(["rev-list", "--parents", "-n", "1", target])?.split_whitespace().skip(1) {
        args.extend(["-p".into(), parent.into()]);
    }
    let created = git
        .exec(
            &GitCmd::new(args)
                .stdin(format!("{}\n", message.trim_end()))
                .env("GIT_AUTHOR_NAME", name)
                .env("GIT_AUTHOR_EMAIL", email)
                .env("GIT_AUTHOR_DATE", date),
        )?
        .text();
    git.run(["rebase", "--autostash", "--rebase-merges", "--onto", created.as_str(), target])
}
