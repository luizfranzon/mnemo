pub mod conflict;
pub mod detail;
pub mod diff;
pub mod encoding;
pub mod git;
pub mod graph;
pub mod handlers;
pub mod ports;
pub mod queue;
pub mod restore;
pub mod session;
pub mod snapshot;
pub mod wip;

/// Limite para fetch/push/pull antes de matar o git.
pub const NETWORK_TIMEOUT: std::time::Duration = std::time::Duration::from_secs(300);
