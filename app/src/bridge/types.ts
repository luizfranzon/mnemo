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

/** `upstream` nulo: o Push define o upstream. */
export type HeadInfo = { kind: 'branch'; name: string; upstream: string | null } | { kind: 'detached'; sha: string }

export interface RepositoryInfo {
  path: string
  name: string
  head: HeadInfo
  undo: UndoRedoState
  toolbar: ToolbarInfo
}
export type PullMode = 'fetch' | 'merge' | 'ffOnly' | 'rebase'
export interface ToolbarInfo {
  ahead: number | null
  behind: number | null
  lastFetchEpoch: number | null
  stashCount: number
  pullMode: PullMode
  progress: { kind: string; step: number | null; total: number | null } | null
}

export interface BranchInfo {
  name: string
  sha: string
  current: boolean
}

export interface RemoteBranchInfo {
  remote: string
  name: string
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
  | { type: 'pull'; strategy: 'merge' | 'ffOnly' | 'rebase' }
  | { type: 'stashCreate'; message: string | null; includeUntracked: boolean }
  | { type: 'stashPop'; index: number }
  | { type: 'deleteRemoteBranch'; remote: string; branch: string }

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

export type WindowAction =
  | 'minimize'
  | 'toggleMaximize'
  | 'close'
  | 'quit'
  | 'toggleFullScreen'
  | 'zoomIn'
  | 'zoomOut'
  | 'zoomReset'
  | 'about'
  | 'undo'
  | 'redo'
  | 'cut'
  | 'copy'
  | 'paste'
  | 'selectAll'
