/** Contrato com o mnemo-core (espelha os tipos serializados em Rust). */

export interface ActionState {
  enabled: boolean
  label: string | null
  reason: string | null
}

export interface UndoRedoState {
  undo: ActionState
  redo: ActionState
}

export type HeadInfo = { kind: 'branch'; name: string } | { kind: 'detached'; sha: string }

export interface RepositoryInfo {
  path: string
  name: string
  head: HeadInfo
  undo: UndoRedoState
}

export interface BranchInfo {
  name: string
  sha: string
  current: boolean
}

export type OperationKind =
  | { type: 'checkout'; target: string }
  | { type: 'commit'; message: string; amend: boolean; allowEmpty: boolean }
  | { type: 'reset'; target: string; mode: 'soft' | 'mixed' | 'hard' }
  | { type: 'branchCreate'; name: string; start: string | null; checkout: boolean }
  | { type: 'discard'; paths: string[] }
  | { type: 'merge'; target: string }
  | { type: 'push'; remote: string | null; branch: string | null; setUpstream: boolean }
  | { type: 'fetch'; remote: string | null }

export type ExecuteResult =
  | { status: 'completed'; opId: number | null; label: string; undoable: boolean; warnings: string[]; state: UndoRedoState }
  | { status: 'conflict'; label: string; progress: string; state: UndoRedoState }

export type CoreEvent =
  | { type: 'operationStarted'; workdir: string; label: string }
  | { type: 'operationFinished'; workdir: string; label: string; ok: boolean }
  | { type: 'historyChanged'; workdir: string; state: UndoRedoState }

export interface DiscardPreview {
  trackedChanges: number
  untrackedFiles: number
  untrackedBytes: number
  /** Acima do limite: o descarte segue sem snapshot (não desfazível). */
  exceedsLimit: boolean
}

export interface ResetPreview extends DiscardPreview {
  commits: number
}

export interface CoreError {
  code: string
  message: string
}

export type MenuAction = 'open-repository' | 'close-tab' | 'undo' | 'redo' | 'palette'
