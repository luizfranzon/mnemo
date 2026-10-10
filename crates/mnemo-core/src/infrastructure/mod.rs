pub mod json_history_store;
pub mod process_git;

use crate::application::git::RepoGit;
use crate::application::ports::EvictionHook;
use crate::domain::operation::Operation;

/// Quando uma Operação sai do histórico, apaga os `refs/mnemo/<id>/…` dela.
pub struct PinnedRefsCleaner;

impl EvictionHook for PinnedRefsCleaner {
    fn on_evicted(&self, git: &RepoGit, op: &Operation) {
        git.delete_pinned(op.id);
    }
}
