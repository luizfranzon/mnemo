use serde::Serialize;

pub type Result<T> = std::result::Result<T, CoreError>;

/// Erro tipado do core. A UI decide a apresentação a partir de `code()`.
#[derive(Debug, Clone, thiserror::Error, Serialize)]
#[serde(tag = "code", rename_all = "camelCase")]
pub enum CoreError {
    #[error("O git não foi encontrado neste computador")]
    GitMissing,
    #[error("O git {found} é antigo demais (mínimo {min})")]
    GitTooOld { found: String, min: String },
    #[error("{path} não é um repositório git")]
    NotARepository { path: String },
    #[error("git {args} falhou: {stderr}")]
    GitFailed { args: String, status: i32, stderr: String },
    #[error("Outro processo git está usando este repositório")]
    IndexLocked,
    #[error("Não há nada para desfazer")]
    NothingToUndo,
    #[error("Não há nada para refazer")]
    NothingToRedo,
    #[error("{reason}")]
    NotUndoable { reason: String },
    #[error("O repositório mudou fora do Mnemo")]
    ExternalChange,
    #[error("{kind} em andamento: use Abortar")]
    InProgress { kind: String },
    #[error("Não há {kind} em andamento")]
    NothingInProgress { kind: String },
    #[error("O restante do trabalho mudou depois da Operação; nada foi alterado")]
    WipChanged,
    #[error("Conflito ao restaurar: {} arquivo(s)", paths.len())]
    RestoreConflict { op_id: u64, paths: Vec<String> },
    #[error("Arquivo em conflito não entra no stash ({}). Resolva o conflito antes.", paths.join(", "))]
    StashConflicted { paths: Vec<String> },
    #[error("Não há nada para fazer: {reason}")]
    NothingToDo { reason: String },
    #[error("Entrada inválida: {reason}")]
    InvalidInput { reason: String },
    #[error("Falha de E/S: {message}")]
    Io { message: String },
    #[error("Falha ao gravar o histórico: {message}")]
    Store { message: String },
    #[error("Falha interna: {message}")]
    Internal { message: String },
}

impl CoreError {
    pub fn invalid(reason: impl Into<String>) -> Self {
        Self::InvalidInput { reason: reason.into() }
    }
    pub fn internal(message: impl Into<String>) -> Self {
        Self::Internal { message: message.into() }
    }
}

impl From<std::io::Error> for CoreError {
    fn from(e: std::io::Error) -> Self {
        Self::Io { message: e.to_string() }
    }
}
