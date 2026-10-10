use crate::domain::error::Result;
use crate::domain::history::OperationHistory;
use crate::domain::operation::Operation;
use crate::domain::repo_state::RepoState;
use crate::domain::undo_state::UndoRedoState;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Um comando git: argumentos, stdin opcional, variáveis extras e códigos de saída aceitos.
#[derive(Clone, Debug, Default)]
pub struct GitCmd {
    pub args: Vec<String>,
    pub stdin: Option<Vec<u8>>,
    pub env: Vec<(String, String)>,
    pub ok_codes: Vec<i32>,
    /// Mata o processo ao passar disso (rede: um ssh esperando senha nunca trava a fila).
    pub timeout: Option<std::time::Duration>,
}

impl GitCmd {
    pub fn new<I, S>(args: I) -> Self
    where
        I: IntoIterator<Item = S>,
        S: Into<String>,
    {
        Self { args: args.into_iter().map(Into::into).collect(), ..Self::default() }
    }

    pub fn stdin(mut self, data: impl Into<Vec<u8>>) -> Self {
        self.stdin = Some(data.into());
        self
    }

    pub fn env(mut self, key: &str, value: impl Into<String>) -> Self {
        self.env.push((key.into(), value.into()));
        self
    }

    pub fn timeout(mut self, d: std::time::Duration) -> Self {
        self.timeout = Some(d);
        self
    }

    /// Aceita também este código de saída como sucesso (além do 0).
    pub fn also_ok(mut self, code: i32) -> Self {
        self.ok_codes.push(code);
        self
    }
}

#[derive(Clone, Debug)]
pub struct GitOutput {
    pub code: i32,
    pub stdout: Vec<u8>,
    pub stderr: String,
}

impl GitOutput {
    pub fn text(&self) -> String {
        String::from_utf8_lossy(&self.stdout).trim_end_matches(['\n', '\r']).to_string()
    }
}

/// Fronteira com o processo git. A implementação real é o executável do sistema.
pub trait GitPort: Send + Sync {
    fn run(&self, cwd: &Path, cmd: &GitCmd) -> Result<GitOutput>;
}

/// Tudo que se persiste de um diretório de trabalho.
#[derive(Clone, Debug, Default, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StoredSession {
    pub history: OperationHistory,
    pub pending: Option<PendingOperation>,
}

/// Merge/rebase/cherry-pick/revert parado em conflito: ainda não é Operação.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PendingOperation {
    pub id: u64,
    pub kind: crate::domain::operation::OperationKind,
    pub before: RepoState,
    pub plan: crate::domain::operation::UndoPlan,
}

/// Persistência do Histórico de Operações, chaveada pelo diretório de trabalho.
pub trait HistoryStore: Send + Sync {
    fn load(&self, workdir: &Path) -> Result<Option<StoredSession>>;
    fn save(&self, workdir: &Path, session: &StoredSession) -> Result<()>;
}

/// Eventos push para a UI (`listen`).
#[derive(Clone, Debug, Serialize)]
#[serde(tag = "type", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum CoreEvent {
    OperationStarted { workdir: PathBuf, label: String },
    OperationFinished { workdir: PathBuf, label: String, ok: bool },
    HistoryChanged { workdir: PathBuf, state: UndoRedoState },
}

pub trait EventSink: Send + Sync {
    fn emit(&self, event: CoreEvent);
}

pub struct NoEvents;
impl EventSink for NoEvents {
    fn emit(&self, _event: CoreEvent) {}
}

/// Ponto de extensão: chamado quando uma Operação sai do histórico
/// (limite, Refazer descartado ou Mudança externa).
pub trait EvictionHook: Send + Sync {
    fn on_evicted(&self, git: &super::git::RepoGit, op: &Operation);
}
