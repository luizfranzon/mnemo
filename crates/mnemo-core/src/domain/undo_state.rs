use serde::Serialize;

/// Estado de um botão (Desfazer ou Refazer) pronto para a UI.
#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ActionState {
    pub enabled: bool,
    /// "Desfazer checkout de x" quando habilitado.
    pub label: Option<String>,
    /// Motivo quando desabilitado.
    pub reason: Option<String>,
}

impl ActionState {
    pub fn enabled(label: String) -> Self {
        Self { enabled: true, label: Some(label), reason: None }
    }
    pub fn disabled(reason: impl Into<String>) -> Self {
        Self { enabled: false, label: None, reason: Some(reason.into()) }
    }
}

#[derive(Clone, Debug, Default, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UndoRedoState {
    pub undo: ActionState,
    pub redo: ActionState,
}
