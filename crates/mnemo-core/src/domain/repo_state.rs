use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

pub const BRANCH_PREFIX: &str = "refs/heads/";
pub const TAG_PREFIX: &str = "refs/tags/";

/// Fotografia barata do que as Operações de refs mexem: HEAD, branches e tags locais.
/// Refs remotas e o stash ficam de fora de propósito (fetch não é Mudança externa).
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RepoState {
    /// `refs/heads/x` quando HEAD aponta para uma branch; `None` em HEAD destacado.
    pub head_ref: Option<String>,
    /// Commit de HEAD; `None` num repositório sem commits.
    pub head_sha: Option<String>,
    pub refs: BTreeMap<String, String>,
    /// Árvore do index no momento da captura (não entra na comparação de refs).
    pub index_tree: Option<String>,
}

impl RepoState {
    /// Igualdade só do que conta para detectar Mudança externa.
    pub fn same_refs(&self, other: &Self) -> bool {
        self.head_ref == other.head_ref && self.head_sha == other.head_sha && self.refs == other.refs
    }

    pub fn branch_name(&self) -> Option<&str> {
        self.head_ref.as_deref().and_then(|r| r.strip_prefix(BRANCH_PREFIX))
    }
}

/// Nome curto de uma ref completa (`refs/heads/x` → `x`).
pub fn short_ref(full: &str) -> &str {
    full.strip_prefix(BRANCH_PREFIX).or_else(|| full.strip_prefix(TAG_PREFIX)).unwrap_or(full)
}

pub fn short_sha(sha: &str) -> &str {
    sha.get(..7).unwrap_or(sha)
}
