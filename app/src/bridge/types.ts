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
  remotes: string[]
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

export interface AuthorInfo { name: string; email: string }

export interface RemoteBranchInfo {
  remote: string
  name: string
}
export interface LocalRef { name: string; sha: string; current: boolean; upstream: string | null; ahead: number | null; behind: number | null }
export interface RemoteRef { remote: string; name: string; sha: string; localExists: boolean }
export interface RemoteGroup { name: string; branches: RemoteRef[]; folders: { name: string; branches: RemoteRef[] }[] }
export interface NamedRef { name: string; sha: string }
export interface RefListing {
  local: LocalRef[]
  remotes: RemoteGroup[]
  worktrees: { path: string; branch: string | null }[]
  stashes: NamedRef[]
  tags: NamedRef[]
  submodules: NamedRef[]
}
export interface GraphCursor { offset: number; lanes: ({ sha: string; color: number } | null)[]; nextColor: number }
export interface GraphSegment { fromLane: number; toLane: number; color: string; kind: 'pass' | 'incoming' | 'parent' }
export interface GraphCommit {
  sha: string; parents: string[]; author: string; email: string; timestamp: number; subject: string; description: string
  lane: number; color: string; laneCount: number; segments: GraphSegment[]
  refs: { name: string; kind: 'local' | 'remote' | 'tag'; current: boolean; upstream: string | null }[]; head: boolean
  /** Branch da pill fantasma (hover/seleção); só em commit sem pill própria. */
  ghost: { name: string; remote: boolean; current: boolean } | null
}
export interface GraphVisibilityArg { hidden: string[]; solo: string | null; smart: boolean }
export interface GraphPage { commits: GraphCommit[]; next: GraphCursor | null; wip: { changed: number; untracked: number } }

export type OperationKind =
  | { type: 'checkout'; target: string }
  | { type: 'checkoutRemote'; remote: string; branch: string }
  | { type: 'checkoutWithChanges'; target: string; remote: string | null; mode: 'stash' | 'carry' }
  | { type: 'commit'; message: string; amend: boolean; allowEmpty: boolean }
  | { type: 'reset'; target: string; mode: 'soft' | 'mixed' | 'hard' }
  | { type: 'branchCreate'; name: string; start: string | null; checkout: boolean }
  | { type: 'discard'; paths: string[] }
  | { type: 'merge'; target: string }
  | { type: 'push'; remote: string | null; branch: string | null; setUpstream: boolean }
  | { type: 'fetch'; remote: string | null }
  | { type: 'pull'; strategy: 'merge' | 'ffOnly' | 'rebase' }
  | { type: 'stashCreate'; message: string | null; includeUntracked: boolean; paths?: string[] }
  | { type: 'stashApplyPaths'; index: number; paths: string[] }
  | { type: 'stashApply'; index: number }
  | { type: 'stashPop'; index: number }
  | { type: 'deleteRemoteBranch'; remote: string; branch: string }
  | { type: 'branchRename'; from: string; to: string }
  | { type: 'branchDelete'; name: string; force: boolean }
  | { type: 'rebase'; onto: string }
  | { type: 'cherryPick'; commit: string }
  | { type: 'revert'; commit: string }
  | { type: 'tagCreate'; name: string; target: string | null; message: string | null }
  | { type: 'reword'; message: string; commit?: string }
  | { type: 'restoreFile'; commit: string; path: string }
  | { type: 'deleteFile'; path: string }

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

export interface FileChange { path: string; oldPath: string | null; status: 'A' | 'M' | 'D' | 'R' | 'C' | 'T' | 'U'; added: number | null; removed: number | null }
export interface CommitDetail {
  sha: string; parents: string[]; author: string; email: string; timestamp: number; subject: string; body: string
  files: FileChange[]; added: number; removed: number
}

export interface WipStatus { unstaged: FileChange[]; staged: FileChange[] }

/** De onde vem o diff de um arquivo: commit (contra o 1º pai), index → diretório, HEAD → index. */
export type DiffSource = { kind: 'commit'; sha: string; oldPath?: string | null } | { kind: 'unstaged' } | { kind: 'staged' }
export interface DiffLine { kind: 'context' | 'add' | 'del'; old: number | null; new: number | null; text: string; noNewline: boolean; hunk: number | null }
export interface DiffHunk { header: string; oldStart: number; oldLines: number; newStart: number; newLines: number; start: number; len: number }
export interface EncodingInfo { id: string; label: string; group: string }
export interface FileDiff {
  path: string; oldPath: string | null; binary: boolean; tooLarge: boolean; encoding: string
  /** `encodingId` volta para `fileDiff`; `guessed`: o detector escolheu; `stageable` falso quando o texto foi convertido (UTF-16/32). */
  encodingId: string; guessed: boolean; stageable: boolean
  added: number; removed: number; hunks: DiffHunk[]; lines: DiffLine[]
}

export interface ConflictFile { path: string; kind: 'both' | 'bothAdded' | 'deletedByUs' | 'deletedByThem' | 'addedByUs' | 'addedByThem' | 'bothDeleted'; binary: boolean }
export type ConflictSegment =
  | { kind: 'text'; lines: string[] }
  /** `auto`: Atual e Entrando só diferem em espaço em branco. */
  | { kind: 'conflict'; ours: string[]; theirs: string[]; base: string[]; auto: boolean }
/** Commit e ref de um lado; `null` fora de merge/rebase/cherry-pick/revert. */
export interface SideLabel { sha: string; name: string | null }
export interface ConflictDoc { path: string; segments: ConflictSegment[]; finalNewline: boolean; oursLabel: SideLabel | null; theirsLabel: SideLabel | null }
export type ConflictChoice = 'base' | 'ours' | 'theirs' | 'delete'
