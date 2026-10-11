import { create } from 'zustand'
import { core, errorCode, errorMessage } from '../bridge'
import type { DiscardPreview, ResetPreview, HeadInfo, OperationKind, RepositoryInfo, UndoRedoState } from '../bridge/types'

export interface Tab {
  /** Diretório de trabalho: a identidade da Aba (o mesmo diretório nunca abre duas vezes). */
  path: string
  name: string
  head: HeadInfo
  undo: UndoRedoState
}

export interface Toast {
  id: number
  text: string
  /** Mostra o botão "Desfazer" (Operação desfazível). */
  undoPath?: string
}

export type GitStatus = { phase: 'checking' } | { phase: 'ok'; version: string } | { phase: 'missing'; message: string }

interface AppState {
  git: GitStatus
  tabs: Tab[]
  activePath: string | null
  /** Operação em curso, por diretório (a toolbar mostra o texto). */
  running: Record<string, string>
  toasts: Toast[]
  error: string | null
  /** Refaz a ação que falhou por `index.lock` (botão "Tentar de novo"). */
  retry: (() => Promise<void>) | null
  paletteOpen: boolean
  /** Descarte aguardando confirmação. */
  resetPrompt: { path: string; target: string; preview: ResetPreview } | null
  discardPrompt: { path: string; paths: string[]; preview: DiscardPreview } | null
  /** Desfazer de um descarte que bateu em edição posterior: oferece a cópia ao lado. */
  restoreConflict: { path: string; opId: number; paths: string[] } | null
}

export const useApp = create<AppState>(() => ({
  git: { phase: 'checking' },
  tabs: [],
  activePath: null,
  running: {},
  toasts: [],
  error: null,
  retry: null,
  paletteOpen: false,
  resetPrompt: null,
  discardPrompt: null,
  restoreConflict: null,
}))

const set = useApp.setState
const get = useApp.getState

let toastSeq = 0
// Windows não diferencia maiúsculas no caminho; Linux diferencia (igual ao `key()` do core).
const CASE_INSENSITIVE = typeof navigator !== 'undefined' && /windows/i.test(navigator.userAgent)
const norm = (p: string) => (CASE_INSENSITIVE ? p.replace(/\\/g, '/').toLowerCase() : p.replace(/\\/g, '/'))
const same = (a: string, b: string) => norm(a) === norm(b)

function patchTab(path: string, patch: Partial<Tab>) {
  set((s) => ({ tabs: s.tabs.map((t) => (same(t.path, path) ? { ...t, ...patch } : t)) }))
}

function pushToast(toast: Omit<Toast, 'id'>) {
  const id = ++toastSeq
  // O "Desfazer" do toast age na última Operação: toasts antigos perdem o botão.
  set((s) => ({ toasts: [...s.toasts.map(stripUndo), { ...toast, id }] }))
  setTimeout(() => dismissToast(id), 6000)
}

const stripUndo = (t: Toast): Toast => ({ ...t, undoPath: undefined })

export function dismissToast(id: number) {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

function fail(err: unknown, retry?: () => Promise<void>) {
  set({ error: errorMessage(err), retry: errorCode(err) === 'indexLocked' ? (retry ?? null) : null })
}

export const actions = {
  async checkGit() {
    set({ git: { phase: 'checking' } })
    try {
      const { version } = await core.checkGit()
      set({ git: { phase: 'ok', version } })
    } catch (err) {
      set({ git: { phase: 'missing', message: errorCode(err) === 'gitMissing' ? 'O git não foi encontrado neste computador.' : errorMessage(err) } })
    }
  },

  async openInitialPaths() {
    for (const p of await core.initialPaths()) await actions.openRepository(p)
  },

  async openRepository(path?: string | null) {
    const target = path ?? (await core.pickFolder())
    if (!target) return
    try {
      const info = await core.openRepository(target)
      adoptRepository(info)
      set({ error: null })
    } catch (err) {
      fail(err)
    }
  },

  closeTab(path: string) {
    void core.closeRepository(path)
    set((s) => {
      const tabs = s.tabs.filter((t) => !same(t.path, path))
      const activePath = s.activePath && same(s.activePath, path) ? (tabs.at(-1)?.path ?? null) : s.activePath
      return { tabs, activePath, retry: null } // o retry pendente era de uma aba que pode ser esta
    })
  },

  focusTab(path: string) {
    set({ activePath: path })
  },

  async execute(path: string, kind: OperationKind) {
    try {
      const r = await core.execute(path, kind)
      patchTab(path, { undo: r.state })
      await refreshHead(path)
      if (r.status === 'conflict') pushToast({ text: `${r.progress} parou em conflito` })
      else if (r.opId !== null) pushToast({ text: capitalize(r.label), undoPath: r.undoable ? path : undefined })
      r.status === 'completed' && r.warnings.forEach((w) => pushToast({ text: w }))
      set({ error: null, retry: null })
    } catch (err) {
      fail(err, () => actions.execute(path, kind))
    }
  },

  async undo(path: string) {
    await stepHistory(path, core.undo)
  },

  async redo(path: string) {
    await stepHistory(path, core.redo)
  },

  async requestDiscard(path: string, paths: string[]) {
    try {
      const preview = await core.discardPreview(path, paths)
      if (preview.trackedChanges + preview.untrackedFiles === 0) return pushToast({ text: 'Não há mudanças para descartar' })
      set({ discardPrompt: { path, paths, preview }, error: null })
    } catch (err) {
      fail(err)
    }
  },

  async confirmDiscard() {
    const prompt = get().discardPrompt
    set({ discardPrompt: null })
    if (prompt) await actions.execute(prompt.path, { type: 'discard', paths: prompt.paths })
  },

  cancelDiscard() {
    set({ discardPrompt: null })
  },

  async requestResetHard(path: string, target: string) {
    try {
      set({ resetPrompt: { path, target, preview: await core.resetPreview(path, target) }, error: null })
    } catch (err) {
      fail(err)
    }
  },

  async confirmReset() {
    const prompt = get().resetPrompt
    set({ resetPrompt: null })
    if (prompt) await actions.execute(prompt.path, { type: 'reset', target: prompt.target, mode: 'hard' })
  },

  cancelReset() {
    set({ resetPrompt: null })
  },

  async restoreAsCopies() {
    const c = get().restoreConflict
    set({ restoreConflict: null })
    if (!c) return
    try {
      const copies = await core.restoreDiscardAsCopies(c.path, c.opId)
      pushToast({ text: `${copies.length} arquivo(s) restaurado(s) como cópia ao lado (.mnemo-restaurado)` })
    } catch (err) {
      fail(err)
    }
  },

  dismissRestoreConflict() {
    set({ restoreConflict: null })
  },

  setPalette(open: boolean) {
    set({ paletteOpen: open })
  },

  clearError() {
    set({ error: null, retry: null })
  },

  /** Eventos push do core (`listen`): mantêm Desfazer/Refazer e a toolbar em dia. */
  applyCoreEvent(e: import('../bridge/types').CoreEvent) {
    if (e.type === 'historyChanged') {
      patchTab(e.workdir, { undo: e.state })
      void refreshHead(e.workdir).catch(() => undefined) // a branch mostrada acompanha o histórico
    }
    else if (e.type === 'operationStarted') set((s) => ({ running: { ...s.running, [norm(e.workdir)]: e.label } }))
    else
      set((s) => {
        const { [norm(e.workdir)]: _done, ...rest } = s.running
        return { running: rest }
      })
  },
}

async function stepHistory(path: string, fn: (p: string) => Promise<UndoRedoState>): Promise<void> {
  set((s) => ({ toasts: s.toasts.map(stripUndo) }))
  try {
    patchTab(path, { undo: await fn(path) })
    await refreshHead(path)
    set({ error: null })
  } catch (err) {
    const c = err as { code?: string; op_id?: number; paths?: string[] }
    if (c.code === 'restoreConflict') {
      set({ restoreConflict: { path, opId: c.op_id!, paths: c.paths ?? [] }, error: null })
      return
    }
    fail(err, () => stepHistory(path, fn))
    // a Mudança externa corta o histórico: relê o estado para o botão refletir o motivo
    await core.syncExternal(path).then((undo) => patchTab(path, { undo }), () => undefined)
  }
}

const refreshing = new Map<string, Promise<void>>()

/** Relê HEAD de uma aba aberta (aba fechada não reabre a sessão); chamadas simultâneas se juntam. */
function refreshHead(path: string): Promise<void> {
  if (!get().tabs.some((t) => same(t.path, path))) return Promise.resolve()
  const key = norm(path)
  const inflight = refreshing.get(key)
  if (inflight) return inflight
  const run = core
    .openRepository(path)
    .then((info) => patchTab(path, { head: info.head, undo: info.undo }))
    .finally(() => refreshing.delete(key))
  refreshing.set(key, run)
  return run
}

function adoptRepository(info: RepositoryInfo) {
  set((s) => {
    const exists = s.tabs.some((t) => same(t.path, info.path))
    const tab: Tab = { path: info.path, name: info.name, head: info.head, undo: info.undo }
    return {
      tabs: exists ? s.tabs.map((t) => (same(t.path, info.path) ? tab : t)) : [...s.tabs, tab],
      activePath: info.path,
    }
  })
}

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const selectActiveTab = (s: AppState) => s.tabs.find((t) => s.activePath !== null && same(t.path, s.activePath))
export const runningLabel = (s: AppState, path: string) => s.running[norm(path)]
