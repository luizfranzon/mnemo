//! Sessão de um diretório de trabalho: fila de Operações, Histórico, Desfazer e Refazer.

use super::git::{failure, ProgressKind, RepoGit};
use super::handlers::{progress_command, ExecCtx, HandlerOutcome, HandlerSet};
use super::ports::{CoreEvent, GitCmd, EventSink, EvictionHook, GitPort, HistoryStore, PendingOperation, StoredSession};
use super::queue::TurnQueue;
use super::restore::{apply_refs, apply_tree_diff, replace_wip, restore_stash_stack};
use super::snapshot::{self, DiscardPreview, ResetPreview};
use crate::diag;
use crate::domain::error::{CoreError, Result};
use crate::domain::operation::{Operation, OperationKind, RefsStrategy, UndoPlan, WipPlan};
use crate::domain::repo_state::RepoState;
use crate::domain::undo_state::{ActionState, UndoRedoState};
use serde::Serialize;
use std::path::PathBuf;
use std::sync::{Arc, Mutex, MutexGuard};
use std::time::{SystemTime, UNIX_EPOCH};

pub struct SessionDeps {
    pub git: Arc<dyn GitPort>,
    pub store: Arc<dyn HistoryStore>,
    pub events: Arc<dyn EventSink>,
    pub handlers: Arc<HandlerSet>,
    pub hooks: Vec<Arc<dyn EvictionHook>>,
    pub snapshot_limit: u64,
    pub history_limit: usize,
}

#[derive(Clone, Debug, Serialize)]
#[serde(tag = "status", rename_all = "camelCase", rename_all_fields = "camelCase")]
pub enum ExecuteResult {
    Completed {
        /// `None` quando nada mudou e nada foi registrado (ex.: merge já atualizado).
        op_id: Option<u64>,
        label: String,
        undoable: bool,
        warnings: Vec<String>,
        state: UndoRedoState,
    },
    /// Parou em conflito: resolva e continue, ou aborte.
    Conflict { label: String, progress: String, state: UndoRedoState },
}

pub struct RepoSession {
    workdir: PathBuf,
    git: RepoGit,
    queue: TurnQueue,
    state: Mutex<Inner>,
    running: Mutex<Option<String>>,
    deps: SessionDeps,
}

struct Inner {
    stored: StoredSession,
    /// A última checagem achou Mudança externa (explica o Desfazer indisponível).
    external_change: bool,
}

impl RepoSession {
    pub fn open(workdir: PathBuf, deps: SessionDeps) -> Result<Self> {
        let git = RepoGit::new(deps.git.clone(), workdir.clone());
        let mut stored = deps.store.load(&workdir)?.unwrap_or_default();
        if stored.history.is_empty() && stored.pending.is_none() {
            stored.history = crate::domain::history::OperationHistory::with_limit(deps.history_limit);
        }
        let session = Self {
            workdir,
            git,
            queue: TurnQueue::default(),
            state: Mutex::new(Inner { stored, external_change: false }),
            running: Mutex::new(None),
            deps,
        };
        {
            let _turn = session.queue.enter();
            session.adopt_finished_locked()?;
            session.sync_external_locked()?;
        }
        Ok(session)
    }

    pub fn workdir(&self) -> &std::path::Path {
        &self.workdir
    }

    /// Alguma Operação rodando ou esperando (o auto-fetch pula quando `true`).
    pub fn is_busy(&self) -> bool {
        self.queue.is_busy()
    }

    /// Texto da toolbar ("Fazendo push…") enquanto algo roda.
    pub fn running_label(&self) -> Option<String> {
        lock(&self.running).clone()
    }

    pub fn undo_state(&self) -> UndoRedoState {
        let inner = lock(&self.state);
        self.compute_state(&inner)
    }

    pub fn execute(&self, kind: OperationKind) -> Result<ExecuteResult> {
        self.in_turn(&kind.running_label(), || self.execute_locked(kind.clone()))
    }

    pub fn undo(&self) -> Result<UndoRedoState> {
        self.in_turn("Desfazendo…", || self.step(Direction::Undo))
    }

    pub fn redo(&self) -> Result<UndoRedoState> {
        self.in_turn("Refazendo…", || self.step(Direction::Redo))
    }

    /// Para o watcher: confere Mudança externa sem competir com uma Operação em curso.
    pub fn sync_external(&self) -> Result<UndoRedoState> {
        if let Some(_turn) = self.queue.try_enter() {
            self.sync_external_locked()?;
        }
        Ok(self.undo_state())
    }

    /// Ao voltar o foco: adota merge concluído fora e confere Mudança externa. `Some` quando adotou.
    pub fn refresh_external(&self) -> Result<Option<ExecuteResult>> {
        let Some(_turn) = self.queue.try_enter() else { return Ok(None) };
        let adopted = self.adopt_finished_locked()?;
        self.sync_external_locked()?;
        if adopted.is_some() {
            self.emit_history();
        }
        Ok(adopted)
    }

    pub fn discard_preview(&self, paths: &[String]) -> Result<DiscardPreview> {
        snapshot::preview(&self.git, paths, self.deps.snapshot_limit)
    }

    /// Quantos commits e mudanças um Reset hard para `target` descartaria.
    pub fn reset_preview(&self, target: &str) -> Result<ResetPreview> {
        Ok(ResetPreview {
            commits: snapshot::commits_lost(&self.git, target)?,
            discard: snapshot::preview(&self.git, &[], self.deps.snapshot_limit)?,
        })
    }

    /// Conflito ao desfazer um descarte: grava as versões guardadas ao lado dos arquivos.
    pub fn restore_discard_as_copies(&self, op_id: u64) -> Result<Vec<String>> {
        let _turn = self.queue.enter();
        let (pin, paths) = {
            let inner = lock(&self.state);
            let op = inner.stored.history.entries().iter().find(|o| o.id == op_id);
            match op.and_then(|o| o.plan.wip.as_ref()) {
                Some(WipPlan::Discard { pin_ref, paths }) => (pin_ref.clone(), paths.clone()),
                _ => return Err(CoreError::invalid("a Operação não guarda um descarte")),
            }
        };
        snapshot::restore_as_copies(&self.git, &pin, &paths)
    }

    pub fn abort_in_progress(&self) -> Result<UndoRedoState> {
        self.in_turn("Abortando…", || {
            let kind = self.progress_or_err()?;
            let cmd = progress_command(kind, "abort");
            let out = self.git.exec(&cmd)?;
            if out.code != 0 {
                return Err(failure(&cmd, &out));
            }
            self.set_pending(None);
            Ok(self.undo_state())
        })
    }

    /// `message` só vale para merge: conclui com `commit -m` em vez de `merge --continue`.
    pub fn continue_in_progress(&self, message: Option<&str>) -> Result<ExecuteResult> {
        self.advance_in_progress("continue", "Continuando…", message)
    }

    pub fn skip_in_progress(&self) -> Result<ExecuteResult> {
        if self.git.in_progress() != Some(crate::application::git::ProgressKind::Rebase) {
            return Err(CoreError::invalid("Pular só está disponível durante rebase"));
        }
        self.advance_in_progress("skip", "Pulando…", None)
    }

    fn advance_in_progress(&self, action: &str, label: &str, message: Option<&str>) -> Result<ExecuteResult> {
        self.in_turn(label, || {
            let kind = match self.progress_or_err() {
                Ok(k) => k,
                // concluído fora enquanto a UI ainda mostrava o conflito
                Err(e) => return self.adopt_finished_locked()?.ok_or(e),
            };
            let cmd = match message.map(str::trim).filter(|m| !m.is_empty()) {
                Some(m) if kind == ProgressKind::Merge && action == "continue" => GitCmd::new(["commit", "-m", m]).also_ok(1).env("GIT_EDITOR", "true"),
                _ => progress_command(kind, action),
            };
            let out = self.git.exec(&cmd)?;
            if out.code != 0 {
                return match self.git.in_progress() {
                    Some(k) => Ok(self.conflict_result(k)),
                    None => Err(failure(&cmd, &out)),
                };
            }
            if let Some(k) = self.git.in_progress() {
                return Ok(self.conflict_result(k));
            }
            let pending = lock(&self.state).stored.pending.take();
            match pending {
                Some(p) => {
                    let after = self.git.capture_state(p.kind.tracks_index())?;
                    self.record(p.id, p.kind, p.before, after, p.plan, Vec::new())
                }
                None => Ok(ExecuteResult::Completed {
                    op_id: None,
                    label: kind.name().to_lowercase(),
                    undoable: false,
                    warnings: vec![],
                    state: self.undo_state(),
                }),
            }
        })
    }

    // ---- núcleo ----------------------------------------------------------------------------

    fn in_turn<T>(&self, label: &str, f: impl FnOnce() -> Result<T>) -> Result<T> {
        let _turn = self.queue.enter();
        *lock(&self.running) = Some(label.to_string());
        self.deps.events.emit(CoreEvent::OperationStarted { workdir: self.workdir.clone(), label: label.to_string() });
        // O guarda roda mesmo com pânico em `f`: o rótulo "rodando" nunca fica preso na UI.
        let mut done = RunGuard { session: self, label, ok: false };
        let started = std::time::Instant::now();
        diag::line(&format!("Operação \"{label}\": início ({})", self.workdir.display()));
        let result = f();
        done.ok = result.is_ok();
        let ms = started.elapsed().as_millis();
        match &result {
            Ok(_) => diag::line(&format!("Operação \"{label}\": fim ok ({ms}ms)")),
            Err(e) => diag::line(&format!("Operação \"{label}\": fim com erro ({ms}ms): {e}")),
        }
        result
    }

    fn execute_locked(&self, kind: OperationKind) -> Result<ExecuteResult> {
        // Fetch só atualiza refs remotas: pode rodar entre passos de resolução de conflito.
        if matches!(kind, OperationKind::Fetch { .. }) {
            if self.git.index_lock_present() {
                return Err(CoreError::IndexLocked);
            }
        } else {
            self.ensure_ready()?;
        }
        let mut before = self.sync_external_locked()?;
        if kind.tracks_index() {
            before.index_tree = self.git.index_tree()?;
        }
        let op_id = lock(&self.state).stored.history.allocate_id();
        let mut ctx = ExecCtx {
            git: &self.git,
            op_id,
            before: &before,
            snapshot_limit: self.deps.snapshot_limit,
            warnings: Vec::new(),
        };
        let outcome = match self.deps.handlers.run(&mut ctx, &kind) {
            Ok(o) => o,
            Err(e) => {
                // O snapshot é o único backup: só solta se o WIP continua igual ao guardado.
                if snapshot::untouched_since_capture(&self.git, op_id) {
                    self.git.delete_pinned(op_id);
                }
                return Err(e);
            }
        };
        let warnings = ctx.warnings;
        match outcome {
            HandlerOutcome::Done(plan) => {
                let after = self.git.capture_state(kind.tracks_index())?;
                self.record(op_id, kind, before, after, plan, warnings)
            }
            HandlerOutcome::Conflict { kind: progress, plan } => {
                let label = kind.label();
                let merge_head = if progress == ProgressKind::Merge { self.git.rev_parse("MERGE_HEAD").ok() } else { None };
                self.set_pending(Some(PendingOperation { id: op_id, kind, before, plan, merge_head }));
                let mut result = self.conflict_result(progress);
                if let ExecuteResult::Conflict { label: l, .. } = &mut result {
                    *l = label;
                }
                Ok(result)
            }
        }
    }

    fn record(
        &self,
        id: u64,
        kind: OperationKind,
        before: RepoState,
        after: RepoState,
        plan: UndoPlan,
        warnings: Vec<String>,
    ) -> Result<ExecuteResult> {
        let label = kind.label();
        let unchanged = plan.refs.is_some() && plan.wip.is_none() && plan.stash.is_none() && before.same_refs(&after);
        if unchanged {
            self.git.delete_pinned(id);
            return Ok(ExecuteResult::Completed {
                op_id: None,
                label,
                undoable: false,
                warnings,
                state: self.undo_state(),
            });
        }
        let undoable = plan.irreversible.is_none();
        let op = Operation { id, kind, label: label.clone(), at_ms: now_ms(), before, after, plan };
        let dropped = {
            let mut inner = lock(&self.state);
            inner.external_change = false;
            let dropped = inner.stored.history.record(op);
            self.persist(&inner);
            dropped
        };
        self.release(&dropped);
        Ok(ExecuteResult::Completed { op_id: Some(id), label, undoable, warnings, state: self.undo_state() })
    }

    fn step(&self, dir: Direction) -> Result<UndoRedoState> {
        self.ensure_ready()?;
        self.sync_external_locked()?;
        let op = {
            let inner = lock(&self.state);
            let found = match dir {
                Direction::Undo => inner.stored.history.last_applied(),
                Direction::Redo => inner.stored.history.next_redo(),
            };
            match found {
                Some(op) => op.clone(),
                None if inner.external_change => return Err(CoreError::ExternalChange),
                None => {
                    return Err(if dir == Direction::Undo {
                        CoreError::NothingToUndo
                    } else {
                        CoreError::NothingToRedo
                    })
                }
            }
        };
        if let Some(reason) = &op.plan.irreversible {
            return Err(CoreError::NotUndoable {
                reason: format!("Não é possível desfazer {}: {reason}", op.label)
            });
        }
        self.revert(&op, dir)?;
        {
            let mut inner = lock(&self.state);
            match dir {
                Direction::Undo => inner.stored.history.mark_undone(),
                Direction::Redo => inner.stored.history.mark_redone(),
            }
            self.persist(&inner);
        }
        Ok(self.undo_state())
    }

    /// Aplica a inversão (ou a reaplicação) de uma Operação: refs → WIP → stash.
    fn revert(&self, op: &Operation, dir: Direction) -> Result<()> {
        let git = &self.git;
        let undo = dir == Direction::Undo;
        let target = if undo { &op.before } else { &op.after };
        if matches!(op.kind, OperationKind::CheckoutWithChanges { .. }) {
            let Some(WipPlan::Replace { before_tree, after_tree, before_index, after_index }) = &op.plan.wip else {
                return Err(CoreError::internal("checkout sem estado do WIP"));
            };
            let expected = if undo { after_tree } else { before_tree };
            if git.wip_tree()? != *expected {
                return Err(CoreError::WipChanged);
            }
            apply_tree_diff(git, expected, &git.head_tree())?;
            git.run(["read-tree", "--reset", "HEAD"])?;
            let refs = op.plan.refs.as_ref().ok_or_else(|| CoreError::internal("checkout sem refs"))?;
            apply_refs(git, target, if undo { refs.undo } else { refs.redo })?;
            let target_tree = if undo { before_tree } else { after_tree };
            apply_tree_diff(git, &git.head_tree(), target_tree)?;
            if let Some(index) = if undo { before_index } else { after_index } {
                git.run(["read-tree", "--reset", index])?;
            }
            if let OperationKind::CheckoutWithChanges { target: branch, remote: Some(remote), .. } = &op.kind {
                if undo {
                    git.exec(
                        &super::ports::GitCmd::new([
                            "config",
                            "--local",
                            "--remove-section",
                            &format!("branch.{branch}"),
                        ])
                        .also_ok(5),
                    )?;
                } else {
                    git.run(["branch", &format!("--set-upstream-to={remote}/{branch}"), branch.as_str()])?;
                }
            }
            if let Some(stash) = &op.plan.stash {
                restore_stash_stack(git, if undo { &stash.before } else { &stash.after })?;
            }
            return Ok(());
        }

        // Refazer um descarte guarda o WIP de agora antes de levá-lo embora.
        if !undo {
            if let Some(WipPlan::Discard { paths, .. }) = &op.plan.wip {
                snapshot::capture(git, op.id)?;
                if op.plan.refs.is_none() {
                    snapshot::discard_changes(git, paths)?;
                }
            }
        }
        if let Some(refs) = &op.plan.refs {
            apply_refs(git, target, if undo { refs.undo } else { refs.redo })?;
            let tracking = match &op.kind {
                OperationKind::CheckoutRemote { remote, branch } => Some((remote, branch)),
                OperationKind::CheckoutWithChanges { target, remote: Some(remote), .. } => Some((remote, target)),
                _ => None,
            };
            if let Some((remote, branch)) = tracking {
                if undo {
                    // update-ref remove a branch, mas não sua configuração de tracking.
                    git.exec(
                        &super::ports::GitCmd::new([
                            "config",
                            "--local",
                            "--remove-section",
                            &format!("branch.{branch}"),
                        ])
                        .also_ok(5),
                    )?;
                } else {
                    git.run(["branch", &format!("--set-upstream-to={remote}/{branch}"), branch.as_str()])?;
                }
            }
        }
        if let Some(wip) = &op.plan.wip {
            match (wip, undo) {
                (WipPlan::Discard { pin_ref, .. }, true) => {
                    if let Err(e) = snapshot::restore(git, op.id, pin_ref) {
                        // nada muda: devolve os refs ao ponto em que estavam
                        if op.plan.refs.is_some() && matches!(e, CoreError::RestoreConflict { .. }) {
                            let _ = apply_refs(git, &op.after, RefsStrategy::Keep);
                        }
                        return Err(e);
                    }
                }
                (WipPlan::Discard { .. }, false) => {}
                (WipPlan::Replace { before_tree, after_tree, before_index, .. }, true) => {
                    replace_wip(git, after_tree, before_tree, before_index.as_deref())?
                }
                (WipPlan::Replace { before_tree, after_tree, after_index, .. }, false) => {
                    replace_wip(git, before_tree, after_tree, after_index.as_deref())?
                }
            }
        }
        if let Some(stash) = &op.plan.stash {
            restore_stash_stack(git, if undo { &stash.before } else { &stash.after })?;
        }
        Ok(())
    }

    /// Mudança externa: se refs/HEAD já não batem com o "depois" da última Operação de refs,
    /// as Operações de refs saem do histórico. Devolve o estado capturado.
    fn sync_external_locked(&self) -> Result<RepoState> {
        let current = self.git.capture_state(false)?;
        if self.git.in_progress().is_some() {
            return Ok(current);
        }
        let cut = {
            let mut inner = lock(&self.state);
            let mismatch = inner.stored.history.expected_refs_state().is_some_and(|e| !e.same_refs(&current));
            if !mismatch {
                return Ok(current);
            }
            let cut = inner.stored.history.cut_refs_operations();
            inner.external_change = true;
            self.persist(&inner);
            cut
        };
        self.release(&cut);
        self.emit_history();
        Ok(current)
    }

    /// Pendência sem nada em andamento foi concluída ou abortada fora. Vira a Operação só se HEAD
    /// é exatamente aquele merge (1º pai = HEAD de antes, 2º = `MERGE_HEAD`); senão é descartada.
    fn adopt_finished_locked(&self) -> Result<Option<ExecuteResult>> {
        if self.git.in_progress().is_some() {
            return Ok(None);
        }
        let Some(p) = lock(&self.state).stored.pending.clone() else { return Ok(None) };
        self.set_pending(None);
        let (Some(ours), Some(theirs)) = (p.before.head_sha.as_deref(), p.merge_head.as_deref()) else { return Ok(None) };
        let line = self.git.text(["rev-list", "--parents", "-n", "1", "HEAD"])?;
        let after = self.git.capture_state(p.kind.tracks_index())?;
        if !line.split_whitespace().skip(1).eq([ours, theirs]) || after.head_ref != p.before.head_ref {
            return Ok(None);
        }
        self.record(p.id, p.kind, p.before, after, p.plan, Vec::new()).map(Some)
    }

    fn ensure_ready(&self) -> Result<()> {
        if self.git.index_lock_present() {
            return Err(CoreError::IndexLocked);
        }
        if let Some(kind) = self.git.in_progress() {
            return Err(CoreError::InProgress { kind: kind.name().to_string() });
        }
        Ok(())
    }

    fn progress_or_err(&self) -> Result<ProgressKind> {
        self.git.in_progress().ok_or_else(|| CoreError::NothingInProgress { kind: "merge ou rebase".into() })
    }

    fn conflict_result(&self, kind: ProgressKind) -> ExecuteResult {
        ExecuteResult::Conflict {
            label: kind.name().to_lowercase(),
            progress: kind.name().into(),
            state: self.undo_state(),
        }
    }

    fn compute_state(&self, inner: &Inner) -> UndoRedoState {
        if let Some(kind) = self.git.in_progress() {
            let reason = format!("{} em andamento: use Abortar", kind.name());
            return UndoRedoState { undo: ActionState::disabled(reason.clone()), redo: ActionState::disabled(reason) };
        }
        let h = &inner.stored.history;
        let action = |op: Option<&Operation>, verb: &str, empty: &str| match op {
            None if inner.external_change => ActionState::disabled("O repositório mudou fora do Mnemo"),
            None => ActionState::disabled(empty),
            Some(op) => match &op.plan.irreversible {
                Some(reason) => ActionState::disabled(format!("Não é possível desfazer {}: {reason}", op.label)),
                None => ActionState::enabled(format!("{verb} {}", op.label)),
            },
        };
        UndoRedoState {
            undo: action(h.last_applied(), "Desfazer", "Nada para desfazer"),
            redo: action(h.next_redo(), "Refazer", "Nada para refazer"),
        }
    }

    fn set_pending(&self, pending: Option<PendingOperation>) {
        let mut inner = lock(&self.state);
        inner.stored.pending = pending;
        self.persist(&inner);
    }

    fn persist(&self, inner: &Inner) {
        // Falha ao gravar o histórico não desfaz a Operação que já aconteceu.
        if let Err(e) = self.deps.store.save(&self.workdir, &inner.stored) {
            diag::error("histórico", &e.to_string());
        }
    }

    fn release(&self, ops: &[Operation]) {
        for op in ops {
            for hook in &self.deps.hooks {
                hook.on_evicted(&self.git, op);
            }
        }
    }

    fn emit_history(&self) {
        self.deps.events.emit(CoreEvent::HistoryChanged { workdir: self.workdir.clone(), state: self.undo_state() });
    }
}

struct RunGuard<'a> {
    session: &'a RepoSession,
    label: &'a str,
    ok: bool,
}

impl Drop for RunGuard<'_> {
    fn drop(&mut self) {
        *lock(&self.session.running) = None;
        let workdir = self.session.workdir.clone();
        self.session.deps.events.emit(CoreEvent::OperationFinished {
            workdir,
            label: self.label.to_string(),
            ok: self.ok,
        });
        self.session.emit_history();
    }
}

#[derive(Clone, Copy, PartialEq, Eq)]
enum Direction {
    Undo,
    Redo,
}

fn lock<T>(m: &Mutex<T>) -> MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

fn now_ms() -> u64 {
    SystemTime::now().duration_since(UNIX_EPOCH).map(|d| d.as_millis() as u64).unwrap_or(0)
}
