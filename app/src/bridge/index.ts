// Único módulo da UI que conhece como falar com o backend. Mesmo formato do `@tauri-apps/api`:
// na migração para o Tauri, só este arquivo troca. Nenhum componente importa `electron`.
import type { BranchInfo, CoreError, CoreEvent, DiscardPreview, ExecuteResult, ResetPreview, MenuAction, OperationKind, RemoteBranchInfo, RepositoryInfo, UndoRedoState } from './types'

interface Transport {
  invoke(cmd: string, args: Record<string, unknown>): Promise<unknown>
  listen(event: 'core' | 'menu', cb: (payload: unknown) => void): () => void
}

declare global {
  interface Window {
    __mnemo: Transport
  }
}

export function invoke<T>(cmd: string, args: Record<string, unknown> = {}): Promise<T> {
  return window.__mnemo.invoke(cmd, args) as Promise<T>
}

export function listen<T>(event: 'core' | 'menu', cb: (payload: T) => void): () => void {
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
  checkGit: () => invoke<{ version: string }>('check_git'),
  initialPaths: () => invoke<string[]>('initial_paths'),
  pickFolder: () => invoke<string | null>('pick_folder'),
  openRepository: (path: string) => invoke<RepositoryInfo>('open_repository', { path }),
  closeRepository: (path: string) => invoke<null>('close_repository', { path }),
  listBranches: (path: string) => invoke<BranchInfo[]>('list_branches', { path }),
  listRemoteBranches: (path: string) => invoke<RemoteBranchInfo[]>('list_remote_branches', { path }),
  execute: (path: string, kind: OperationKind) => invoke<ExecuteResult>('execute_operation', { path, kind }),
  resetPreview: (path: string, target: string) => invoke<ResetPreview>('reset_preview', { path, target }),
  discardPreview: (path: string, paths: string[]) => invoke<DiscardPreview>('discard_preview', { path, paths }),
  restoreDiscardAsCopies: (path: string, opId: number) => invoke<string[]>('restore_discard_as_copies', { path, opId }),
  undo: (path: string) => invoke<UndoRedoState>('undo', { path }),
  redo: (path: string) => invoke<UndoRedoState>('redo', { path }),
  syncExternal: (path: string) => invoke<UndoRedoState>('sync_external', { path }),
  setMenuState: (state: Record<string, unknown>) => invoke<null>('set_menu_state', state),
}

export const onCoreEvent = (cb: (e: CoreEvent) => void) => listen<CoreEvent>('core', cb)
export const onMenuAction = (cb: (a: MenuAction) => void) => listen<MenuAction>('menu', cb)
