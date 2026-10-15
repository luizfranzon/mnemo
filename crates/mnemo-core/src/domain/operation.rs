use super::repo_state::RepoState;
use serde::{Deserialize, Serialize};

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum ResetMode {
    Soft,
    Mixed,
    Hard,
}

impl ResetMode {
    pub fn flag(self) -> &'static str {
        match self {
            Self::Soft => "--soft",
            Self::Mixed => "--mixed",
            Self::Hard => "--hard",
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum PullStrategy {
    Merge,
    Rebase,
    FfOnly,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum CheckoutChangesMode {
    Stash,
    Carry,
}

/// O que o usuário pede. Cada variante vira uma Operação registrada.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum OperationKind {
    Checkout {
        target: String,
    },
    CheckoutRemote {
        remote: String,
        branch: String,
    },
    CheckoutWithChanges {
        target: String,
        remote: Option<String>,
        mode: CheckoutChangesMode,
    },
    Commit {
        message: String,
        amend: bool,
        allow_empty: bool,
        /// `-S`: assina com a chave do git.
        #[serde(default)]
        sign: bool,
        /// `--no-verify`: pula os hooks pre-commit e commit-msg.
        #[serde(default)]
        no_verify: bool,
    },
    Reset {
        target: String,
        mode: ResetMode,
    },
    BranchCreate {
        name: String,
        start: Option<String>,
        checkout: bool,
    },
    BranchRename {
        from: String,
        to: String,
    },
    BranchDelete {
        name: String,
        force: bool,
    },
    TagCreate {
        name: String,
        target: Option<String>,
        message: Option<String>,
    },
    TagDelete {
        name: String,
    },
    /// `paths` vazio = descartar tudo.
    Discard {
        paths: Vec<String>,
    },
    Merge {
        target: String,
    },
    Rebase {
        onto: String,
    },
    CherryPick {
        commit: String,
    },
    Revert {
        commit: String,
    },
    Pull {
        strategy: Option<PullStrategy>,
    },
    /// `paths` vazio = todo o WIP; senão só esses arquivos/pastas. Com arquivo em conflito o git recusa o stash (erro com os caminhos).
    StashCreate {
        message: Option<String>,
        include_untracked: bool,
        #[serde(default)]
        paths: Vec<String>,
    },
    StashApply {
        index: usize,
    },
    StashPop {
        index: usize,
    },
    StashDrop {
        index: usize,
    },
    /// Traz para o diretório de trabalho só estes arquivos/pastas do stash, sem preparar e sem tirá-lo da lista.
    StashApplyPaths {
        index: usize,
        paths: Vec<String>,
    },
    Push {
        remote: Option<String>,
        branch: Option<String>,
        set_upstream: bool,
        /// `--force-with-lease` preso a este sha da branch remota (o que o usuário viu ao confirmar).
        #[serde(default)]
        lease: Option<String>,
    },
    Fetch {
        remote: Option<String>,
    },
    DeleteRemoteBranch {
        remote: String,
        branch: String,
    },
    /// Reescreve a mensagem de `commit` (HEAD quando ausente). Em commit mais antigo, os descendentes são refeitos (rebase).
    /// O que está preparado fica de fora.
    Reword {
        message: String,
        #[serde(default)]
        commit: Option<String>,
    },
    /// Traz o arquivo como estava em `commit` para o diretório de trabalho e o index.
    RestoreFile {
        commit: String,
        path: String,
    },
    /// Remove o arquivo do diretório de trabalho e do index.
    DeleteFile {
        path: String,
    },
}

impl OperationKind {
    /// Frase em minúsculas com o alvo ("checkout de t34951"). A UI prefixa "Desfazer"/"Refazer".
    pub fn label(&self) -> String {
        use OperationKind::*;
        match self {
            Checkout { target } => format!("checkout de {target}"),
            CheckoutRemote { remote, branch } => format!("criar {branch} rastreando {remote}/{branch}"),
            CheckoutWithChanges { target, mode, .. } => format!("checkout de {target} ({mode:?})"),
            Commit { amend: true, .. } => "amend".into(),
            Commit { .. } => "commit".into(),
            Reset { target, mode } => format!("reset {} para {target}", mode.flag().trim_start_matches("--")),
            BranchCreate { name, .. } => format!("criar branch {name}"),
            BranchRename { from, to } => format!("renomear branch {from} para {to}"),
            BranchDelete { name, .. } => format!("excluir branch {name}"),
            TagCreate { name, .. } => format!("criar tag {name}"),
            TagDelete { name } => format!("excluir tag {name}"),
            Discard { paths } if paths.is_empty() => "descartar todas as mudanças".into(),
            Discard { paths } if paths.len() == 1 => format!("descartar {}", paths[0]),
            Discard { paths } => format!("descartar {} arquivos", paths.len()),
            Merge { target } => format!("merge de {target}"),
            Rebase { onto } => format!("rebase sobre {onto}"),
            CherryPick { commit } => format!("cherry-pick de {commit}"),
            Revert { commit } => format!("revert de {commit}"),
            Pull { .. } => "pull".into(),
            StashCreate { paths, .. } if paths.len() == 1 => format!("guardar {} no stash", paths[0]),
            StashCreate { paths, .. } if !paths.is_empty() => format!("guardar {} itens no stash", paths.len()),
            StashCreate { .. } => "criar stash".into(),
            StashApply { index } => format!("aplicar stash@{{{index}}}"),
            StashPop { index } => format!("pop de stash@{{{index}}}"),
            StashDrop { index } => format!("excluir stash@{{{index}}}"),
            StashApplyPaths { index, paths } if paths.len() == 1 => format!("aplicar {} de stash@{{{index}}}", paths[0]),
            StashApplyPaths { index, paths } => format!("aplicar {} itens de stash@{{{index}}}", paths.len()),
            Push { .. } => "push".into(),
            Fetch { .. } => "fetch".into(),
            DeleteRemoteBranch { remote, branch } => format!("excluir {remote}/{branch}"),
            Reword { .. } => "editar mensagem".into(),
            RestoreFile { commit, path } => format!("restaurar {path} de {}", commit.get(..7).unwrap_or(commit)),
            DeleteFile { path } => format!("excluir {path}"),
        }
    }

    /// A Operação restaura a árvore do index ao ser desfeita (precisa dela gravada).
    pub fn tracks_index(&self) -> bool {
        use OperationKind::*;
        matches!(
            self,
            Commit { .. }
                | StashCreate { .. }
                | StashApply { .. }
                | StashPop { .. }
                | StashApplyPaths { .. }
                | CheckoutWithChanges { .. }
                | RestoreFile { .. }
                | DeleteFile { .. }
        ) || matches!(self, Reset { mode, .. } if *mode != ResetMode::Hard)
    }

    /// Texto da toolbar enquanto a Operação roda.
    pub fn running_label(&self) -> String {
        use OperationKind::*;
        match self {
            Push { .. } => "Fazendo push…".into(),
            Fetch { .. } => "Fazendo fetch…".into(),
            Pull { .. } => "Fazendo pull…".into(),
            other => format!("Executando {}…", other.label()),
        }
    }
}

/// Como mover refs/HEAD de volta (ou adiante, no Refazer).
#[derive(Clone, Copy, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub enum RefsStrategy {
    /// Só `update-ref`; não toca index nem árvore de trabalho (branch/tag).
    Refs,
    /// Como `Refs` e restaura a árvore do index registrada (commit, amend, reset soft/mixed).
    RefsIndex,
    /// `git switch` de volta; troca a árvore de trabalho (checkout).
    Checkout,
    /// `reset --keep`: move a branch e a árvore, preservando mudanças locais (merge, rebase…).
    Keep,
    /// `reset --hard` (só no Refazer de um reset hard).
    Hard,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RefsPlan {
    pub undo: RefsStrategy,
    pub redo: RefsStrategy,
}

impl RefsPlan {
    pub fn same(strategy: RefsStrategy) -> Self {
        Self { undo: strategy, redo: strategy }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum WipPlan {
    /// Descarte: o WIP de antes foi guardado no commit preso a `pin_ref`.
    Discard { paths: Vec<String>, pin_ref: String },
    /// Troca de WIP entre duas árvores (stash): vale enquanto o WIP bate com a árvore esperada.
    Replace { before_tree: String, after_tree: String, before_index: Option<String>, after_index: Option<String> },
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StashEntry {
    pub sha: String,
    pub message: String,
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct StashPlan {
    pub before: Vec<StashEntry>,
    pub after: Vec<StashEntry>,
}

/// Dados para inverter uma Operação. As peças opcionais se compõem.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoPlan {
    /// `Some(motivo)` quando a Operação não pode ser desfeita.
    pub irreversible: Option<String>,
    pub refs: Option<RefsPlan>,
    pub wip: Option<WipPlan>,
    pub stash: Option<StashPlan>,
}

impl UndoPlan {
    pub fn refs(strategy: RefsStrategy) -> Self {
        Self { refs: Some(RefsPlan::same(strategy)), ..Self::default() }
    }
    pub fn irreversible(reason: impl Into<String>) -> Self {
        Self { irreversible: Some(reason.into()), ..Self::default() }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Operation {
    pub id: u64,
    pub kind: OperationKind,
    pub label: String,
    pub at_ms: u64,
    pub before: RepoState,
    pub after: RepoState,
    pub plan: UndoPlan,
}

impl Operation {
    /// Depende do estado dos refs (e por isso cai numa Mudança externa).
    pub fn depends_on_refs(&self) -> bool {
        self.plan.refs.is_some() || self.plan.irreversible.is_some()
    }
}
