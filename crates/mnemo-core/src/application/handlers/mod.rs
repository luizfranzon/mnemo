//! Um handler por família de Operação. Cada um executa a ação git e devolve o plano de inversão.

mod discard;
mod file_ops;
pub mod integrate;
mod refs_ops;
mod remote;
mod reset;
mod stash;

use super::git::{ProgressKind, RepoGit};
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{OperationKind, UndoPlan};
use crate::domain::repo_state::RepoState;

pub struct ExecCtx<'a> {
    pub git: &'a RepoGit,
    pub op_id: u64,
    pub before: &'a RepoState,
    pub snapshot_limit: u64,
    pub warnings: Vec<String>,
}

pub enum HandlerOutcome {
    Done(UndoPlan),
    /// Parou em conflito: ainda não é Operação.
    Conflict {
        kind: ProgressKind,
        plan: UndoPlan,
    },
}

pub trait Handler: Send + Sync {
    fn handles(&self, kind: &OperationKind) -> bool;
    fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome>;
}

pub struct HandlerSet(Vec<Box<dyn Handler>>);

impl Default for HandlerSet {
    fn default() -> Self {
        Self(vec![
            Box::new(refs_ops::RefsOps),
            Box::new(reset::ResetHandler),
            Box::new(discard::DiscardHandler),
            Box::new(file_ops::FileOps),
            Box::new(integrate::IntegrateHandler),
            Box::new(stash::StashHandler),
            Box::new(remote::RemoteHandler),
        ])
    }
}

impl HandlerSet {
    pub fn run(&self, ctx: &mut ExecCtx, kind: &OperationKind) -> Result<HandlerOutcome> {
        self.0
            .iter()
            .find(|h| h.handles(kind))
            .ok_or_else(|| CoreError::internal("Operação sem handler"))?
            .run(ctx, kind)
    }
}

pub use integrate::progress_command;
