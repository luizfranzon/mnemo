// Único módulo da UI que conhece como falar com o backend. Mesmo formato do `@tauri-apps/api`:
// na migração para o Tauri, só este arquivo troca. Nenhum componente importa `electron`.
import type { AuthorInfo, ConflictChoice, ConflictDoc, ConflictFile, BranchInfo, CoreError, CoreEvent, DiffSource, DiscardPreview, ExecuteResult, EncodingInfo, FileChange, FileDiff, GraphCursor, GraphPage, GraphVisibilityArg, CommitDetail, ResetPreview, OperationKind, PullMode, RefListing, RemoteBranchInfo, RepoPrefs, RepositoryInfo, ForcePushPreview, ToolbarInfo, UndoRedoState, UpdateState, WindowAction, WipStatus } from './types'

interface Transport {
  invoke(cmd: string, args: Record<string, unknown>): Promise<unknown>
  listen(event: 'core', cb: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    __mnemo: Transport
  }
}

export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return window.__mnemo.invoke(cmd, args) as Promise<T>
}

export function listen<T>(event: 'core', cb: (payload: T) => void): () => void {
  return window.__mnemo.listen(event, cb as (payload: unknown) => void)
}

export function errorMessage(err: unknown): string {
  return (err as Partial<CoreError>)?.message ?? String(err)
}

export function errorCode(err: unknown): string {
  return (err as Partial<CoreError>)?.code ?? 'internal'
}

/** Comandos tipados. */
export const core = {
  updateState: () => invoke<UpdateState>('update_state'),
  updateCheck: () => invoke<UpdateState>('update_check'),
  updateDownload: () => invoke<UpdateState>('update_download'),
  updateInstall: () => invoke<null>('update_install'),
  checkGit: () => invoke<{ version: string }>('check_git'),
  initialPaths: () => invoke<string[]>('initial_paths'),
  pickFolder: () => invoke<string | null>('pick_folder'),
  openRepository: (path: string) => invoke<RepositoryInfo>('open_repository', { path }),
  setPullMode: (path: string, mode: PullMode) => invoke<ToolbarInfo>('set_pull_mode', { path, mode }),
  repoPrefs: (path: string) => invoke<RepoPrefs>('repo_prefs', { path }),
  setRepoPref: (path: string, key: keyof RepoPrefs, value: boolean) => invoke<RepoPrefs>('set_repo_pref', { path, key, value }),
  abortInProgress: (path: string) => invoke<UndoRedoState>('abort_in_progress', { path }),
  continueInProgress: (path: string, message?: string, sign = false, noVerify = false) => invoke<ExecuteResult>('continue_in_progress', { path, message, sign, noVerify }),
  skipInProgress: (path: string) => invoke<ExecuteResult>('skip_in_progress', { path }),
  closeRepository: (path: string) => invoke<null>('close_repository', { path }),
  listBranches: (path: string) => invoke<BranchInfo[]>('list_branches', { path }),
  listRemoteBranches: (path: string) => invoke<RemoteBranchInfo[]>('list_remote_branches', { path }),
  listAuthors: (path: string) => invoke<AuthorInfo[]>('list_authors', { path }),
  listRefs: (path: string) => invoke<RefListing>('list_refs', { path }),
  checkoutConflictCount: (path: string, target: string) => invoke<number>('checkout_conflict_count', { path, target }),
  graphPage: (path: string, cursor: GraphCursor | null, limit = 2000, visibility?: GraphVisibilityArg) => invoke<GraphPage>('graph_page', { path, cursor, limit, visibility }),
  wipStatus: (path: string) => invoke<WipStatus>('wip_status', { path }),
  /** Preparar / tirar do stage; paths vazio = todos. Não são Operações. */
  stage: (path: string, paths: string[], on: boolean) => invoke<null>(on ? 'stage' : 'unstage', { path, paths }),
  /** `full`: o arquivo inteiro (linhas entre trechos com `hunk` nulo); senão só os trechos. */
  /** `encoding`: `guess`, `binary` ou um id de `listEncodings`. */
  fileDiff: (path: string, file: string, source: DiffSource, full: boolean, encoding = 'guess') => invoke<FileDiff>('file_diff', { path, file, source, full, encoding }),
  listEncodings: (path: string) => invoke<EncodingInfo[]>('list_encodings', { path }),
  /** Prepara (ou tira) só estas linhas `[trecho, linha no trecho]`; mexe só no index. Não é Operação. */
  stageLines: (path: string, file: string, unstage: boolean, lines: [number, number][]) => invoke<null>('stage_lines', { path, file, unstage, lines }),
  conflictList: (path: string) => invoke<ConflictFile[]>('conflict_list', { path }),
  conflictFile: (path: string, file: string) => invoke<ConflictDoc>('conflict_file', { path, file }),
  /** Grava o resultado; `resolve` marca como resolvido (`git add`). Com marcadores, `false`. */
  conflictSave: (path: string, file: string, content: string, resolve = true) => invoke<null>('conflict_save', { path, file, content, resolve }),
  conflictTake: (path: string, file: string, choice: ConflictChoice) => invoke<null>('conflict_take', { path, file, choice }),
  conflictReopen: (path: string, files: string[]) => invoke<null>('conflict_reopen', { path, files }),
  conflictMergetool: (path: string, file: string) => invoke<null>('conflict_mergetool', { path, file }),
  stashFiles: (path: string, index: number) => invoke<FileChange[]>('stash_files', { path, index }),
  /** Acrescenta um padrão ao `.gitignore` da raiz. */
  ignore: (path: string, pattern: string) => invoke<null>('ignore', { path, pattern }),
  commitDetail: (path: string, sha: string, all: boolean) => invoke<CommitDetail>('commit_detail', { path, sha, all }),
  pushForcePreview: (path: string) => invoke<ForcePushPreview>('push_force_preview', { path }),
  commitOnRemote: (path: string, sha: string) => invoke<boolean>('commit_on_remote', { path, sha }),
  remoteUrl: (path: string, remote: string) => invoke<string | null>('remote_url', { path, remote }),
  execute: (path: string, kind: OperationKind) => invoke<ExecuteResult>('execute_operation', { path, kind }),
  resetPreview: (path: string, target: string) => invoke<ResetPreview>('reset_preview', { path, target }),
  discardPreview: (path: string, paths: string[]) => invoke<DiscardPreview>('discard_preview', { path, paths }),
  restoreDiscardAsCopies: (path: string, opId: number) => invoke<string[]>('restore_discard_as_copies', { path, opId }),
  undo: (path: string) => invoke<UndoRedoState>('undo', { path }),
  redo: (path: string) => invoke<UndoRedoState>('redo', { path }),
  syncExternal: (path: string) => invoke<UndoRedoState>('sync_external', { path }),
  /** Adota merge concluído fora e confere Mudança externa; devolve o merge adotado, se houve. */
  /** `true` quando alguma ref remota mudou; `false` também quando pulou por haver Operação em curso. */
  autoFetch: (path: string, prune: boolean) => invoke<boolean>('auto_fetch', { path, prune }),
  maintenance: (path: string) => invoke<null>('maintenance', { path }),
  refreshExternal: (path: string) => invoke<ExecuteResult | null>('refresh_external', { path }),
  /** Arquivo do repositório fora do app: editor (`$VISUAL`/`$EDITOR`/code), programa padrão ou pasta. */
  openFile: (workdir: string, file: string, how: 'editor' | 'default' | 'folder') => invoke<null>('open_file', { workdir, file, how }),
  /** Observa HEAD e refs do repositório (mudança por fora vira o evento `repoChanged`); nulo para de observar. */
  watchRepository: (path: string | null) => invoke<null>('watch_repository', { path }),
  /** Controles da janela e edição nativa (a janela não tem moldura nem menu do sistema). */
  window: (action: WindowAction) => invoke<null>('window_action', { action }),
}

export const onCoreEvent = (cb: (e: CoreEvent) => void) => listen<CoreEvent>('core', cb)
