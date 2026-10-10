use super::operation::Operation;
use super::repo_state::RepoState;
use serde::{Deserialize, Serialize};

pub const HISTORY_LIMIT: usize = 50;

/// Pilha linear de Operações com cursor: `entries[..cursor]` estão aplicadas,
/// `entries[cursor..]` podem ser refeitas. Lógica pura, sem E/S.
#[derive(Clone, Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct OperationHistory {
    entries: Vec<Operation>,
    cursor: usize,
    next_id: u64,
    limit: usize,
}

impl Default for OperationHistory {
    fn default() -> Self {
        Self::with_limit(HISTORY_LIMIT)
    }
}

impl OperationHistory {
    pub fn with_limit(limit: usize) -> Self {
        Self { entries: Vec::new(), cursor: 0, next_id: 1, limit: limit.max(1) }
    }

    pub fn allocate_id(&mut self) -> u64 {
        let id = self.next_id;
        self.next_id += 1;
        id
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }

    pub fn is_empty(&self) -> bool {
        self.entries.is_empty()
    }

    pub fn entries(&self) -> &[Operation] {
        &self.entries
    }

    pub fn last_applied(&self) -> Option<&Operation> {
        self.cursor.checked_sub(1).and_then(|i| self.entries.get(i))
    }

    pub fn next_redo(&self) -> Option<&Operation> {
        self.entries.get(self.cursor)
    }

    /// Registra uma Operação nova. Devolve o que saiu do histórico (Refazer descartado e
    /// as mais antigas acima do limite) para o chamador liberar os recursos delas.
    pub fn record(&mut self, op: Operation) -> Vec<Operation> {
        let mut dropped: Vec<Operation> = self.entries.drain(self.cursor..).collect();
        self.entries.push(op);
        while self.entries.len() > self.limit {
            dropped.push(self.entries.remove(0));
        }
        self.cursor = self.entries.len();
        dropped
    }

    pub fn mark_undone(&mut self) {
        self.cursor = self.cursor.saturating_sub(1);
    }

    pub fn mark_redone(&mut self) {
        if self.cursor < self.entries.len() {
            self.cursor += 1;
        }
    }

    /// Estado de refs que o repositório deve ter agora se ninguém mexeu por fora.
    pub fn expected_refs_state(&self) -> Option<&RepoState> {
        let applied = self.entries[..self.cursor].iter().rev().find(|o| o.depends_on_refs());
        if let Some(op) = applied {
            return Some(&op.after);
        }
        self.entries[self.cursor..].iter().find(|o| o.depends_on_refs()).map(|o| &o.before)
    }

    /// Mudança externa: tira as Operações de refs; descartes e não desfazíveis ficam.
    pub fn cut_refs_operations(&mut self) -> Vec<Operation> {
        let kept_before_cursor = self.entries[..self.cursor].iter().filter(|o| !o.depends_on_refs()).count();
        let (kept, cut): (Vec<_>, Vec<_>) =
            std::mem::take(&mut self.entries).into_iter().partition(|o| !o.depends_on_refs());
        self.entries = kept;
        self.cursor = kept_before_cursor;
        cut
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::domain::operation::{OperationKind, RefsStrategy, UndoPlan};

    fn op(h: &mut OperationHistory, refs: bool) -> Operation {
        Operation {
            id: h.allocate_id(),
            kind: OperationKind::Fetch { remote: None },
            label: "x".into(),
            at_ms: 0,
            before: RepoState::default(),
            after: RepoState::default(),
            plan: if refs { UndoPlan::refs(RefsStrategy::Refs) } else { UndoPlan::default() },
        }
    }

    #[test]
    fn nova_operacao_descarta_o_refazer() {
        let mut h = OperationHistory::default();
        let a = op(&mut h, true);
        h.record(a);
        h.mark_undone();
        let b = op(&mut h, true);
        let dropped = h.record(b);
        assert_eq!(dropped.len(), 1);
        assert!(h.next_redo().is_none());
    }

    #[test]
    fn limite_expulsa_a_mais_antiga() {
        let mut h = OperationHistory::with_limit(3);
        let mut out = vec![];
        for _ in 0..4 {
            let o = op(&mut h, true);
            out.extend(h.record(o));
        }
        assert_eq!(h.len(), 3);
        assert_eq!(out.iter().map(|o| o.id).collect::<Vec<_>>(), vec![1]);
    }

    #[test]
    fn corte_preserva_operacoes_sem_refs() {
        let mut h = OperationHistory::default();
        let (a, b, c) = (op(&mut h, true), op(&mut h, false), op(&mut h, true));
        for o in [a, b, c] {
            h.record(o);
        }
        h.mark_undone();
        let cut = h.cut_refs_operations();
        assert_eq!(cut.len(), 2);
        assert_eq!(h.len(), 1);
        assert_eq!(h.last_applied().map(|o| o.id), Some(2));
    }
}
