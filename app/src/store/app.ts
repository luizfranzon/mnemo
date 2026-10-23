import { create } from 'zustand'
import { core, errorCode, errorMessage } from '../bridge'
import type { DiffSource, DiscardPreview, FileChange, ForcePushPreview, GraphPage, ResetPreview, HeadInfo, OperationKind, PullMode, RepoPrefs, RepositoryInfo, Review, ReviewComment, ReviewFile, ReviewScope, ReviewState, ReviewSummary, ToolbarInfo, UndoRedoState, UpdateState } from '../bridge/types'
import { nextFile, rangeOf } from '../components/reviewModel'
import { toolbarAvailability } from '../components/toolbarModel'
import { graphVisibility, selectVisibility, useVisibility } from './visibility'
import { overwrittenPaths } from './overwritten'
import { tabLabel } from './tabLabel'

export interface Tab {
  /** Diretório de trabalho: a identidade da Aba (o mesmo diretório nunca abre duas vezes). */
  path: string
  name: string
  head: HeadInfo
  undo: UndoRedoState
  toolbar: ToolbarInfo
  /** Emails (minúsculos) do filtro de Autores do grafo; vazio = sem filtro. Vive só enquanto a aba está aberta. */
  authors: string[]
  /** Diretório do repositório pai, quando a aba é um submódulo aberto a partir dele (alimenta o breadcrumb). */
  parent?: string
  /** Erro do último auto-fetch; `null`/ausente = deu certo. */
  autoFetchError?: string | null
}

export interface Toast {
  id: number
  /** Nome da aba de onde veio; toast global (preferências, atualização) não tem. */
  title?: string
  text: string
  /** Mostra o botão "Desfazer" (Operação desfazível). */
  undoPath?: string
  pullPath?: string
  /** Erro: fica mais tempo e, se `retry`, oferece "Tentar de novo". */
  error?: boolean
  /** Aviso neutro (azul). */
  info?: boolean
  retry?: () => Promise<void>
  /** Botões extras do toast (ex.: resolver e repetir a Operação). */
  buttons?: { label: string; run: () => Promise<unknown> }[]
}

export type PaletteMode = 'checkout' | 'createBranch'

export type GitStatus = { phase: 'checking' } | { phase: 'ok'; version: string } | { phase: 'missing'; message: string }

interface AppState {
  git: GitStatus
  tabs: Tab[]
  activePath: string | null
  /** Seleção, diff e conflito por diretório: cada aba é isolada e volta como foi deixada. */
  views: Record<string, TabView>
  graphRevision: Record<string, number>
  /** Muda quando o WIP muda sem Operação (preparar, tirar, ignorar): painel WIP e diff releem. */
  wipRevision: Record<string, number>
  /** Operação em curso, por diretório (a toolbar mostra o texto). */
  running: Record<string, string>
  toasts: Toast[]
  /** Atualização do app (GitHub Releases): o ícone da barra de status age sobre ela. */
  update: UpdateState
  /** Refaz a ação que falhou por `index.lock` (botão "Tentar de novo"). */
  palette: PaletteMode | null
  /** Ponto de partida da nova branch (nulo = HEAD). */
  paletteStart: string | null
  /** Diretório a que a paleta se aplica quando não é o da aba ativa (submódulo aberto pelo painel de refs). */
  paletteTarget: string | null
  checkoutPrompt: { path: string; target: string; remote: string | null; conflicts: number; behind: number } | null
  pushPrompt: { path: string; branch: string; remotes: string[] } | null
  /** Push que o remoto rejeitou (branch atrás): a barra sobre o grafo oferece Pull, Force Push e Cancelar. */
  pushRejected: { path: string; branch: string; upstream: string } | null
  /** Force Push aguardando confirmação (o preview já buscou a remota). */
  forcePrompt: { path: string; preview: ForcePushPreview } | null
  /** Descarte aguardando confirmação. */
  resetPrompt: { path: string; target: string; preview: ResetPreview } | null
  discardPrompt: { path: string; paths: string[]; preview: DiscardPreview } | null
  /** Desfazer de um descarte que bateu em edição posterior: oferece a cópia ao lado. */
  restoreConflict: { path: string; opId: number; paths: string[] } | null
  /** Preferências globais (dados do app). Preferência de repositório fica no `.git/config` (ADR 0005). */
  prefs: Prefs
  prefsOpen: boolean
  /** Preferências de repositório já lidas do `.git/config`, por diretório. */
  repoPrefs: Record<string, RepoPrefs>
  /** Revisão aberta na Aba (modo Revisão): o diff do centro e o painel direito são dela. */
  reviews: Record<string, ReviewView>
  /** Revisões do repositório, para o menu da toolbar e os marcadores do grafo. */
  reviewList: Record<string, ReviewSummary[]>
  /** Começar Revisão ou Rodada: o diálogo confirma a Base. */
  reviewPrompt: { path: string; branch: string; base: string; round: number } | null
  /** Encerrar Revisão aguardando confirmação (apaga as rodadas). */
  reviewEndPrompt: { path: string; branch: string } | null
}

export interface ReviewView { branch: string; state: ReviewState; scope: ReviewScope }

interface TabView { selectedSha: string | null; diff: DiffTarget | null; conflict: { path: string; file: string } | null }

export interface DiffTarget { path: string; file: FileChange; source: DiffSource }

export interface Prefs {
  gravatar: boolean
  dateOrder: boolean
  /** Reabre as abas da sessão anterior. */
  rememberTabs: boolean
  /** Fetch com `--prune`. */
  prune: boolean
  /** Duplo clique numa branch (grafo ou painel de refs) faz checkout. */
  doubleClickCheckout: boolean
  /** Pill fantasma da branch ao passar o mouse ou selecionar um commit sem ref. */
  ghostRefs: boolean
  /** Minutos entre fetches automáticos das abas abertas; 0 desliga. */
  autoFetchMinutes: number
}
export const DEFAULT_PREFS: Prefs = { gravatar: true, dateOrder: false, rememberTabs: true, prune: true, doubleClickCheckout: true, ghostRefs: true, autoFetchMinutes: 5 }
const PREFS_KEY = 'mnemo.prefs'
/** Só aceita valor salvo do mesmo tipo do padrão; o resto (chave ausente, lixo) fica no padrão. */
export function loadPrefs(): Prefs {
  try {
    const saved = JSON.parse(localStorage.getItem(PREFS_KEY) ?? '{}') as Record<string, unknown>
    return Object.fromEntries(Object.entries(DEFAULT_PREFS).map(([k, v]) => [k, typeof saved[k] === typeof v ? saved[k] : v])) as unknown as Prefs
  } catch { return DEFAULT_PREFS }
}

export const useApp = create<AppState>(() => ({
  git: { phase: 'checking' },
  tabs: [],
  activePath: null,
  views: {},
  graphRevision: {},
  wipRevision: {},
  running: {},
  toasts: [],
  update: { status: 'none' },
  palette: null,
  paletteStart: null,
  paletteTarget: null,
  checkoutPrompt: null,
  pushPrompt: null,
  pushRejected: null,
  forcePrompt: null,
  resetPrompt: null,
  discardPrompt: null,
  restoreConflict: null,
  prefs: loadPrefs(),
  prefsOpen: false,
  repoPrefs: {},
  reviews: {},
  reviewList: {},
  reviewPrompt: null,
  reviewEndPrompt: null,
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

/** `path`: a aba de onde o toast veio, que vira o título (fixado agora: sobrevive à aba fechar). */
function pushToast({ path, ...toast }: Omit<Toast, 'id' | 'title'> & { path?: string }) {
  const id = ++toastSeq
  const tabs = get().tabs
  const tab = path === undefined ? undefined : tabs.find((t) => same(t.path, path))
  const title = tab && tabLabel(tabs, tab.path)
  // O "Desfazer" do toast age na última Operação: toasts antigos perdem o botão.
  set((s) => ({ toasts: [...s.toasts.map(stripUndo), { ...toast, title, id }] }))
  setTimeout(() => dismissToast(id), toast.error ? 12000 : 6000)
}

const stripUndo = (t: Toast): Toast => ({ ...t, undoPath: undefined })

export function dismissToast(id: number) {
  set((s) => ({ toasts: s.toasts.filter((t) => t.id !== id) }))
}

const EMPTY_VIEW: TabView = { selectedSha: null, diff: null, conflict: null }
function patchView(path: string, patch: Partial<TabView> | ((v: TabView) => Partial<TabView>)) {
  set((s) => {
    const v = s.views[norm(path)] ?? EMPTY_VIEW
    return { views: { ...s.views, [norm(path)]: { ...v, ...(typeof patch === 'function' ? patch(v) : patch) } } }
  })
}

function clearPushRejected(path: string) {
  if (get().pushRejected && same(get().pushRejected!.path, path)) set({ pushRejected: null })
}

function fail(err: unknown, path?: string, retry?: () => Promise<void>) {
  const text = errorMessage(err)
  pushToast({ path, text: text.length > 300 ? `${text.slice(0, 300)}…` : text, error: true, retry: errorCode(err) === 'indexLocked' ? retry : undefined,
    buttons: path === undefined ? undefined : blockedPullButtons(err, path) })
}

/** Pull barrado por arquivos que seriam sobrescritos: guardar no stash ou descartar, e repetir o pull. */
function blockedPullButtons(err: unknown, path: string): Toast['buttons'] {
  const { args = '', stderr = '' } = err as { args?: string; stderr?: string }
  const paths = errorCode(err) === 'gitFailed' && /^pull\b/.test(args) ? overwrittenPaths(stderr) : []
  if (paths.length === 0) return undefined
  const then = async (kind: OperationKind) => { if (await actions.execute(path, kind)) await actions.pullNow(path) }
  return [
    { label: 'Stash e tentar de novo', run: () => then({ type: 'stashCreate', message: null, includeUntracked: true, paths }) },
    { label: 'Descartar e tentar de novo', run: () => then({ type: 'discard', paths }) },
  ]
}

export const actions = {
  reportError(err: unknown, path?: string) { fail(err, path) },
  async refreshUpdate() { set({ update: await core.updateState().catch(() => ({ status: 'none' as const })) }) },
  /** Clique na versão: checa na hora; sem novidade, avisa. */
  async checkUpdate() {
    const next = await core.updateCheck().catch(() => null)
    if (next) set({ update: next })
    if (next?.status === 'none') pushToast({ text: 'Você já está na versão mais recente', info: true })
  },
  async downloadUpdate() { set({ update: await core.updateDownload() }) },
  /** Reiniciar fecha o app: recusa enquanto houver Operação em curso. */
  installUpdate() {
    if (Object.keys(get().running).length > 0) return pushToast({ text: 'Aguarde a Operação terminar para reiniciar e atualizar', info: true })
    void core.updateInstall()
  },
  info(text: string, path?: string) { pushToast({ path, text, info: true }) },
  async checkoutRef(path: string, kind: Extract<OperationKind, { type: 'checkout' | 'checkoutRemote' }>, behind = 0) {
    const target = kind.type === 'checkout' ? kind.target : kind.branch
    const remote = kind.type === 'checkoutRemote' ? kind.remote : null
    try {
      const conflicts = await core.checkoutConflictCount(path, remote ? `${remote}/${target}` : target)
      if (conflicts > 0) {
        set({ checkoutPrompt: { path, target, remote, conflicts, behind } })
        return
      }
    } catch (err) { fail(err, path); return }
    const executed = await actions.execute(path, kind)
    const head = get().tabs.find((tab) => same(tab.path, path))?.head
    if (behind > 0 && head?.kind === 'branch' && head.name === target && executed)
      await actions.execute(path, { type: 'pull', strategy: 'ffOnly' })
  },
  async confirmCheckout(mode: 'stash' | 'carry') {
    const prompt = get().checkoutPrompt
    set({ checkoutPrompt: null })
    if (!prompt) return
    const executed = await actions.execute(prompt.path, { type: 'checkoutWithChanges', target: prompt.target, remote: prompt.remote, mode })
    const head = get().tabs.find((tab) => same(tab.path, prompt.path))?.head
    if (prompt.behind > 0 && head?.kind === 'branch' && head.name === prompt.target && executed)
      await actions.execute(prompt.path, { type: 'pull', strategy: 'ffOnly' })
  },
  cancelCheckout() { set({ checkoutPrompt: null }) },
  async pullNow(path: string) {
    const mode = get().tabs.find((tab) => same(tab.path, path))?.toolbar.pullMode
    await actions.execute(path, { type: 'pull', strategy: mode === 'rebase' || mode === 'ffOnly' ? mode : 'merge' })
  },
  async checkGit() {
    set({ git: { phase: 'checking' } })
    try {
      const { version } = await core.checkGit()
      set({ git: { phase: 'ok', version } })
    } catch (err) {
      set({ git: { phase: 'missing', message: errorCode(err) === 'gitMissing' ? 'O git não foi encontrado neste computador.' : errorMessage(err) } })
    }
  },

  /** Reabre as Abas da sessão anterior (as que sumiram do disco ficam de fora) e depois as passadas na linha de comando. */
  async openInitialPaths() {
    const saved = get().prefs.rememberTabs ? loadSession() : { paths: [], active: null }
    for (const p of saved.paths) {
      try { adoptRepository(await core.openRepository(p)) } catch { /* pasta apagada ou movida */ }
    }
    const cli = await core.initialPaths()
    for (const p of cli) await actions.openRepository(p)
    const active = saved.active && get().tabs.find((t) => same(t.path, saved.active!))
    if (active && !cli.length) set({ activePath: active.path })
    sessionReady = true
    saveSession()
  },

  async openRepository(path?: string | null) {
    const target = path ?? (await core.pickFolder())
    if (!target) return
    try {
      const info = await core.openRepository(target)
      adoptRepository(info)
    } catch (err) {
      fail(err)
    }
  },

  /** Abre o submódulo (caminho relativo ao pai, como o `git submodule status` devolve) numa aba própria, com o pai no breadcrumb. */
  async openSubmodule(parent: string, name: string) {
    try {
      const info = await core.openRepository(submodulePath(parent, name))
      // pasta vazia (submódulo não iniciado): o git sobe até o repositório pai
      if (same(info.path, parent)) throw new Error(`O submódulo ${name} não foi iniciado`)
      adoptRepository(info, parent)
    } catch (err) {
      fail(err)
    }
  },

  closeTab(path: string) {
    void core.closeRepository(path)
    set((s) => {
      const tabs = s.tabs.filter((t) => !same(t.path, path))
      const { [norm(path)]: _closed, ...views } = s.views
      const { [norm(path)]: _review, ...reviews } = s.reviews
      const activePath = s.activePath && same(s.activePath, path) ? (tabs.at(-1)?.path ?? null) : s.activePath
      return { tabs, views, reviews, activePath, pushPrompt: s.pushPrompt && same(s.pushPrompt.path, path) ? null : s.pushPrompt } // o retry pendente era de uma aba que pode ser esta
    })
  },

  focusTab(path: string) {
    set({ activePath: path })
  },
  selectCommit(path: string, sha: string) { patchView(path, (v) => ({ selectedSha: sha, diff: v.selectedSha === sha ? v.diff : null })) },
  openDiff(diff: DiffTarget) { patchView(diff.path, { diff, conflict: null }) },
  /** No modo Revisão, fechar o diff volta ao grafo (a Revisão continua salva). */
  closeDiff(path: string) {
    patchView(path, { diff: null })
    if (get().reviews[norm(path)]) actions.closeReview(path)
  },
  openConflict(path: string, file: string) { patchView(path, { conflict: { path, file }, diff: null }) },
  closeConflict(path: string) { patchView(path, { conflict: null }) },
  /** Preparar/tirar/ignorar mudaram o WIP: quem mostra o WIP relê. */
  wipChanged(path: string) { set((s) => ({ wipRevision: { ...s.wipRevision, [norm(path)]: (s.wipRevision[norm(path)] ?? 0) + 1 } })) },
  setAuthorFilter(path: string, authors: string[]) { patchTab(path, { authors }) },

  /** `false` quando a Operação falhou (o erro já virou toast). */
  async execute(path: string, kind: OperationKind): Promise<boolean> {
    try {
      const r = await core.execute(path, kind.type === 'fetch' ? { ...kind, prune: get().prefs.prune } : kind)
      patchTab(path, { undo: r.state })
      await refreshHead(path)
      if (r.status === 'conflict') pushToast({ path, text: `${r.progress} parou em conflito` })
      else if (r.noEffect !== null) pushToast({ path, text: r.noEffect, info: true })
      else if (r.opId !== null) {
        const tracking = kind.type === 'checkoutRemote' ? { branch: kind.branch, remote: kind.remote }
          : kind.type === 'checkoutWithChanges' && kind.remote ? { branch: kind.target, remote: kind.remote } : null
        pushToast({ path, text: tracking ? `criada ${tracking.branch} rastreando ${tracking.remote}/${tracking.branch}` : capitalize(r.label),
          undoPath: r.undoable ? path : undefined })
      }
      r.status === 'completed' && r.warnings.forEach((w) => pushToast({ path, text: w }))
      if (kind.type === 'push' || kind.type === 'pull') clearPushRejected(path)
      return true
    } catch (err) {
      if (errorCode(err) === 'pushRejected') {
        const { branch, upstream } = err as { branch: string; upstream: string }
        set({ pushRejected: { path, branch, upstream } })
        return false
      }
      fail(err, path, async () => void (await actions.execute(path, kind)))
      return false
    }
  },

  async setPullMode(path: string, mode: PullMode) {
    try {
      patchTab(path, { toolbar: await core.setPullMode(path, mode) })
    } catch (err) { fail(err, path) }
  },

  async requestPush(path: string) {
    const tab = get().tabs.find((t) => same(t.path, path))
    if (!tab || tab.head.kind !== 'branch') return
    const reason = toolbarAvailability(tab.head, tab.toolbar, runningLabel(get(), path)).push
    if (reason) return fail(new Error(reason), path)
    if (tab.head.upstream !== null) {
      return actions.execute(path, { type: 'push', remote: null, branch: null, setUpstream: false })
    }
    const remotes = tab.toolbar.remotes
    const remote = remotes.includes('origin') ? 'origin' : remotes.length === 1 ? remotes[0] : undefined
    if (remote) return actions.execute(path, { type: 'push', remote, branch: tab.head.name, setUpstream: true })
    set({ pushPrompt: { path, branch: tab.head.name, remotes } })
  },

  async confirmPush(remote: string) {
    const prompt = get().pushPrompt
    set({ pushPrompt: null })
    if (!prompt || !prompt.remotes.includes(remote)) return
    const tab = get().tabs.find((t) => same(t.path, prompt.path))
    if (!tab || tab.head.kind !== 'branch' || tab.head.name !== prompt.branch) return
    const reason = toolbarAvailability(tab.head, tab.toolbar, runningLabel(get(), prompt.path)).push
    if (reason) return fail(new Error(reason), prompt.path)
    await actions.execute(prompt.path, { type: 'push', remote, branch: prompt.branch, setUpstream: true })
  },

  cancelPush() {
    set({ pushPrompt: null })
  },

  cancelPushRejected() { set({ pushRejected: null }) },

  /** Pull da barra: avança se der, senão faz merge. O push fica por conta do usuário (pode haver merge para revisar). */
  async pullAfterRejection(path: string) {
    if (!(await actions.execute(path, { type: 'pull', strategy: 'merge' }))) return
    const progress = get().tabs.find((t) => same(t.path, path))?.toolbar.progress
    if (!progress) pushToast({ path, text: 'Pull concluído. Faça o push de novo.' })
  },

  async requestForcePush(path: string) {
    try {
      set({ forcePrompt: { path, preview: await core.pushForcePreview(path) } })
    } catch (err) { fail(err, path) }
  },

  async confirmForcePush() {
    const prompt = get().forcePrompt
    set({ forcePrompt: null })
    if (!prompt) return
    const { remote, branch, sha } = prompt.preview
    await actions.execute(prompt.path, { type: 'push', remote, branch, setUpstream: false, lease: sha })
  },

  cancelForcePush() { set({ forcePrompt: null }) },

  async progressAction(path: string, action: 'continue' | 'skip' | 'abort', message?: string, sign = false, noVerify = false): Promise<boolean> {
    try {
      if (action === 'abort') patchTab(path, { undo: await core.abortInProgress(path) })
      else {
        const result = action === 'continue' ? await core.continueInProgress(path, message, sign, noVerify) : await core.skipInProgress(path)
        patchTab(path, { undo: result.state })
      }
      await refreshHead(path)
      return true
    } catch (err) { fail(err, path); return false }
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
      if (preview.trackedChanges + preview.untrackedFiles === 0) return pushToast({ path, text: 'Não há mudanças para descartar' })
      set({ discardPrompt: { path, paths, preview } })
    } catch (err) {
      fail(err, path)
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
      set({ resetPrompt: { path, target, preview: await core.resetPreview(path, target) } })
    } catch (err) {
      fail(err, path)
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
      pushToast({ path: c.path, text: `${copies.length} arquivo(s) restaurado(s) como cópia ao lado (.mnemo-restaurado)` })
    } catch (err) {
      fail(err, c.path)
    }
  },

  dismissRestoreConflict() {
    set({ restoreConflict: null })
  },

  setPrefsOpen(prefsOpen: boolean) {
    set({ prefsOpen })
  },

  setPref<K extends keyof Prefs>(key: K, value: Prefs[K]) {
    const prefs = { ...get().prefs, [key]: value }
    set({ prefs })
    pushToast({ text: 'Preferências salvas' })
    try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)) } catch { /* sem storage */ }
  },

  async loadRepoPrefs(path: string) {
    try {
      const prefs = await core.repoPrefs(path)
      set((s) => ({ repoPrefs: { ...s.repoPrefs, [norm(path)]: prefs } }))
    } catch (err) { fail(err, path) }
  },

  async setRepoPref(path: string, key: keyof RepoPrefs, value: boolean) {
    try {
      const prefs = await core.setRepoPref(path, key, value)
      set((s) => ({ repoPrefs: { ...s.repoPrefs, [norm(path)]: prefs } }))
      pushToast({ path, text: 'Preferências salvas' })
    } catch (err) { fail(err, path) }
  },

  setPalette(palette: PaletteMode | null, start: string | null = null, target: string | null = null) {
    set({ palette, paletteStart: start, paletteTarget: target })
  },

  clearError() {
  },

  /** Fetch periódico das abas abertas. Silencioso: erro de rede não vira toast, só o indicador da toolbar. */
  async autoFetchAll() {
    await Promise.all(get().tabs.map(async ({ path }) => {
      try {
        const changed = await core.autoFetch(path, get().prefs.prune)
        if (changed) set((s) => ({ graphRevision: { ...s.graphRevision, [norm(path)]: (s.graphRevision[norm(path)] ?? 0) + 1 } }))
        patchTab(path, { autoFetchError: null })
        await refreshHead(path)
      } catch (err) { patchTab(path, { autoFetchError: errorMessage(err) }) }
    }))
  },

  async runMaintenance(path: string) {
    try {
      await core.maintenance(path)
      pushToast({ path, text: 'Manutenção concluída' })
    } catch (err) { fail(err, path, () => actions.runMaintenance(path)) }
  },

  /** Janela voltou ao foco: relê todas as abas, que podem ter mudado fora (VS Code, terminal). */
  async refreshAll() {
    await Promise.all(get().tabs.map(({ path }) => refreshTab(path)))
  },

  async loadReviews(path: string) {
    try {
      const list = await core.reviewList(path)
      set((s) => ({ reviewList: { ...s.reviewList, [norm(path)]: list } }))
    } catch (err) { fail(err, path) }
  },

  /** Revisar branch: Rodada aberta continua direto; senão o diálogo confirma a Base antes de começar. */
  async requestReview(path: string, branch: string) {
    await actions.loadReviews(path)
    const current = get().reviewList[norm(path)]?.find((r) => r.branch === branch)
    if (current?.open) return actions.openReview(path, branch)
    const base = await core.reviewBase(path, branch).catch(() => null)
    set({ reviewPrompt: { path, branch, base: base ?? '', round: current ? current.round + 1 : 1 } })
  },
  cancelReviewPrompt() { set({ reviewPrompt: null }) },

  /** Busca a branch, avança a local até a remota (Operação desfazível) e começa a Revisão ou a próxima Rodada. */
  async startReview(path: string, branch: string, base: string): Promise<boolean> {
    const offline = await core.reviewFetch(path, branch).catch((err: unknown) => errorMessage(err))
    await syncLocalBranch(path, branch)
    try {
      enterReview(path, branch, await core.reviewStart(path, branch, base))
    } catch (err) { fail(err, path); return false }
    set({ reviewPrompt: null })
    if (offline) pushToast({ path, text: `Não foi possível buscar ${branch} no remoto. A revisão usa o que já está neste computador.`, info: true })
    void actions.loadReviews(path)
    return true
  },

  async openReview(path: string, branch: string) {
    try { enterReview(path, branch, await core.reviewOpen(path, branch)) } catch (err) { fail(err, path) }
  },

  /** Relê a Rodada aberta (a branch pode ter andado: os avisos do painel acompanham). */
  async refreshReview(path: string) {
    const r = get().reviews[norm(path)]
    if (!r) return
    const state = await core.reviewOpen(path, r.branch).catch(() => null)
    if (state && get().reviews[norm(path)]?.branch === r.branch) patchReview(path, { state })
  },

  closeReview(path: string) {
    set((s) => { const { [norm(path)]: _closed, ...reviews } = s.reviews; return { reviews } })
    patchView(path, { diff: null })
  },

  openReviewFile(path: string, file: ReviewFile) {
    const r = get().reviews[norm(path)]
    const round = r?.state.review.rounds.at(-1)
    if (!r || !round) return
    const { from, to } = rangeOf(round, r.scope)
    patchView(path, { diff: { path, file, source: { kind: 'range', from, to, oldPath: file.oldPath } }, conflict: null })
  },

  setReviewScope(path: string, scope: ReviewScope) {
    patchReview(path, { scope })
    const open = get().views[norm(path)]?.diff
    if (open?.source.kind === 'range') actions.openReviewFile(path, open.file as ReviewFile)
  },

  /** Marca (ou desmarca) o arquivo. `advance`: abre o próximo que falta revisar. */
  async markReviewed(path: string, file: string, reviewed: boolean, advance = false) {
    const r = get().reviews[norm(path)]
    if (!r) return
    try {
      const review = await core.reviewMark(path, r.branch, file, reviewed)
      setReviewData(path, review)
      const next = advance && reviewed ? nextFile(r.state.files, review.rounds.at(-1)!.reviewed, file) : null
      if (next) actions.openReviewFile(path, next)
    } catch (err) { fail(err, path) }
  },

  async saveComment(path: string, comment: ReviewComment): Promise<boolean> {
    const r = get().reviews[norm(path)]
    if (!r) return false
    try {
      setReviewData(path, await core.reviewComment(path, r.branch, comment))
      return true
    } catch (err) { fail(err, path); return false }
  },

  async deleteComment(path: string, id: string) {
    const r = get().reviews[norm(path)]
    if (!r) return
    try { setReviewData(path, await core.reviewUncomment(path, r.branch, id)) } catch (err) { fail(err, path) }
  },

  async concludeRound(path: string): Promise<Review | null> {
    const r = get().reviews[norm(path)]
    if (!r) return null
    try {
      const review = await core.reviewConclude(path, r.branch)
      setReviewData(path, review)
      void actions.loadReviews(path)
      return review
    } catch (err) { fail(err, path); return null }
  },

  requestEndReview(path: string, branch: string) { set({ reviewEndPrompt: { path, branch } }) },
  cancelEndReview() { set({ reviewEndPrompt: null }) },
  async confirmEndReview() {
    const prompt = get().reviewEndPrompt
    set({ reviewEndPrompt: null })
    if (!prompt) return
    try {
      await core.reviewEnd(prompt.path, prompt.branch)
      if (get().reviews[norm(prompt.path)]?.branch === prompt.branch) actions.closeReview(prompt.path)
      pushToast({ path: prompt.path, text: `Revisão de ${prompt.branch} encerrada` })
      await actions.loadReviews(prompt.path)
    } catch (err) { fail(err, prompt.path) }
  },

  /** Eventos push do core (`listen`): mantêm Desfazer/Refazer e a toolbar em dia. */
  applyCoreEvent(e: import('../bridge/types').CoreEvent) {
    if (e.type === 'update') { const { type: _type, ...update } = e; set({ update }); return }
    if (e.type !== 'repoChanged') ownActivity.set(norm(e.workdir), Date.now())
    if (e.type === 'repoChanged') {
      // o app mesmo mexeu nas refs agora há pouco: o grafo já foi relido pelos eventos da Operação
      if (get().running[norm(e.workdir)] || Date.now() - (ownActivity.get(norm(e.workdir)) ?? 0) < 1500) return
      void refreshTab(e.workdir)
    } else if (e.type === 'historyChanged') {
      patchTab(e.workdir, { undo: e.state })
      set((s) => ({ graphRevision: { ...s.graphRevision, [norm(e.workdir)]: (s.graphRevision[norm(e.workdir)] ?? 0) + 1 } }))
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
  } catch (err) {
    const c = err as { code?: string; op_id?: number; paths?: string[] }
    if (c.code === 'restoreConflict') {
      set({ restoreConflict: { path, opId: c.op_id!, paths: c.paths ?? [] } })
      return
    }
    fail(err, path, () => stepHistory(path, fn))
    // a Mudança externa corta o histórico: relê o estado para o botão refletir o motivo
    await core.syncExternal(path).then((undo) => patchTab(path, { undo }), () => undefined)
  }
}

function patchReview(path: string, patch: Partial<ReviewView>) {
  set((s) => { const r = s.reviews[norm(path)]; return r ? { reviews: { ...s.reviews, [norm(path)]: { ...r, ...patch } } } : {} })
}

/** Dados da Revisão que o core devolveu depois de gravar; arquivos e avisos ficam como estão. */
function setReviewData(path: string, review: Review) {
  set((s) => {
    const r = s.reviews[norm(path)]
    return r && r.branch === review.branch ? { reviews: { ...s.reviews, [norm(path)]: { ...r, state: { ...r.state, review } } } } : {}
  })
}

/** Entra no modo Revisão e abre o primeiro arquivo que falta revisar. */
function enterReview(path: string, branch: string, state: ReviewState) {
  set((s) => ({ reviews: { ...s.reviews, [norm(path)]: { branch, state, scope: 'round' } } }))
  const round = state.review.rounds.at(-1)
  const first = round && (nextFile(state.files, round.reviewed, null) ?? state.files.find((f) => !f.reverted))
  if (first) actions.openReviewFile(path, first)
  else patchView(path, { diff: null })
}

/** Local atrás da remota que rastreia: avança (pull na branch atual). Divergiu: a Revisão segue a remota e avisa. */
async function syncLocalBranch(path: string, branch: string) {
  const local = (await core.listRefs(path).catch(() => null))?.local.find((b) => b.name === branch)
  if (!local?.upstream?.endsWith(`/${branch}`) || !local.behind) return
  if (local.ahead) return pushToast({ path, text: `${branch} local divergiu de ${local.upstream}. A revisão usa ${local.upstream}.`, info: true })
  await actions.execute(path, local.current ? { type: 'pull', strategy: 'ffOnly' } : { type: 'fastForward', branch })
}

/** Diretório de um submódulo, a partir do nome (caminho relativo) que o `git submodule status` devolve. */
export const submodulePath = (parent: string, name: string) => `${parent.replace(/[\\/]+$/, '')}/${name}`

/** Relê uma aba que mudou fora do app: Mudança externa no histórico, grafo e HEAD. */
async function refreshTab(path: string) {
  const r = await core.refreshExternal(path).catch(() => null)
  if (r?.status === 'completed' && r.opId !== null) pushToast({ path, text: capitalize(r.label), undoPath: r.undoable ? path : undefined })
  set((s) => ({ graphRevision: { ...s.graphRevision, [norm(path)]: (s.graphRevision[norm(path)] ?? 0) + 1 } }))
  await refreshHead(path).catch(() => undefined)
}

/** Quando o core falou de cada diretório pela última vez, para o watcher não reler o que o app mesmo acabou de fazer. */
const ownActivity = new Map<string, number>()

const refreshing = new Map<string, Promise<void>>()

/** Relê HEAD de uma aba aberta (aba fechada não reabre a sessão); chamadas simultâneas se juntam. */
function refreshHead(path: string): Promise<void> {
  if (!get().tabs.some((t) => same(t.path, path))) return Promise.resolve()
  const key = norm(path)
  const inflight = refreshing.get(key)
  if (inflight) return inflight
  const run = core
    .openRepository(path)
    .then((info) => patchTab(path, { head: info.head, undo: info.undo, toolbar: info.toolbar }))
    .finally(() => refreshing.delete(key))
  refreshing.set(key, run)
  return run
}

/** Commits por página do grafo. */
export const GRAPH_PAGE = 200
type GraphArgs = ReturnType<typeof graphVisibility>
// 1ª página pedida ao abrir a Aba, em paralelo à montagem da UI. Vale uma vez e por pouco tempo: nunca serve dado velho.
let graphPrefetch: { key: string; at: number; page: Promise<GraphPage> } | null = null
const graphKey = (path: string, args: GraphArgs) => JSON.stringify([norm(path), args])

function prefetchGraph(path: string) {
  const args = graphVisibility(selectVisibility(path)(useVisibility.getState()), get().prefs.dateOrder)
  const page = core.graphPage(path, null, GRAPH_PAGE, args)
  page.catch(() => {}) // o erro chega a quem consumir
  graphPrefetch = { key: graphKey(path, args), at: Date.now(), page }
}

/** 1ª página do grafo: a pedida ao abrir a Aba, se for destes argumentos e recente; senão pede agora. */
export function firstGraphPage(path: string, args: GraphArgs): Promise<GraphPage> {
  const hit = graphPrefetch && graphPrefetch.key === graphKey(path, args) && Date.now() - graphPrefetch.at < 5000 ? graphPrefetch.page : null
  graphPrefetch = null
  return hit ?? core.graphPage(path, null, GRAPH_PAGE, args)
}

function adoptRepository(info: RepositoryInfo, parent?: string) {
  if (!get().tabs.some((t) => same(t.path, info.path))) prefetchGraph(info.path)
  set((s) => {
    const exists = s.tabs.some((t) => same(t.path, info.path))
    const authors = s.tabs.find((t) => same(t.path, info.path))?.authors ?? []
    const tab: Tab = { path: info.path, name: info.name, head: info.head, undo: info.undo, toolbar: info.toolbar, authors, parent: parent ?? s.tabs.find((t) => same(t.path, info.path))?.parent }
    return {
      tabs: exists ? s.tabs.map((t) => (same(t.path, info.path) ? tab : t)) : [...s.tabs, tab],
      activePath: info.path,
    }
  })
}

// Abas abertas ficam no localStorage do Electron (dados do app) e voltam ao reabrir. Só grava depois de restaurar,
// para a lista vazia do início não apagar a sessão salva.
const SESSION_KEY = 'mnemo.session'
let sessionReady = false
function loadSession(): { paths: string[]; active: string | null } {
  try {
    const raw = JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as { paths?: unknown; active?: unknown }
    return { paths: Array.isArray(raw.paths) ? raw.paths.filter((p): p is string => typeof p === 'string') : [], active: typeof raw.active === 'string' ? raw.active : null }
  } catch { return { paths: [], active: null } }
}
function saveSession() {
  const { tabs, activePath } = get()
  try { localStorage.setItem(SESSION_KEY, JSON.stringify({ paths: tabs.map((t) => t.path), active: activePath })) } catch { /* sem storage */ }
}
useApp.subscribe((state, prev) => { if (sessionReady && (state.tabs.length !== prev.tabs.length || state.activePath !== prev.activePath)) saveSession() })

const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)

export const selectActiveTab = (s: AppState) => s.tabs.find((t) => s.activePath !== null && same(t.path, s.activePath))
export const runningLabel = (s: AppState, path: string) => s.running[norm(path)]
/** Muda quando refs ou HEAD mudam (Operação, fetch, mudança externa). */
export const selectGraphRevision = (path: string) => (s: AppState) => s.graphRevision[norm(path)] ?? 0
export const selectWipRevision = (path: string) => (s: AppState) => (s.graphRevision[norm(path)] ?? 0) + (s.wipRevision[norm(path)] ?? 0)
/** Diff aberto nesta Aba (o de outra Aba não aparece aqui). */
/** Só a aba ativa reage a atalhos globais; as outras seguem montadas, escondidas. */
export const isActiveTab = (path: string) => { const a = get().activePath; return !!a && same(a, path) }
export const selectSha = (path: string) => (s: AppState) => s.views[norm(path)]?.selectedSha ?? null
export const selectDiff = (path: string) => (s: AppState) => s.views[norm(path)]?.diff ?? null
export const selectRepoPrefs = (path: string) => (s: AppState): RepoPrefs | undefined => s.repoPrefs[norm(path)]
/** Opções do painel WIP com o padrão das Preferências do repositório (antes de ler o config: tudo desligado, hooks ligados). */
export const commitOptions = (p: RepoPrefs | undefined) => ({ sign: p?.signCommits ?? false, hooks: !p?.skipHooks, pushAfter: p?.pushAfterCommit ?? false })
export const selectConflict = (path: string) => (s: AppState) => s.views[norm(path)]?.conflict ?? null
/** Revisão aberta nesta Aba (`undefined` = fora do modo Revisão). */
export const selectReview = (path: string) => (s: AppState): ReviewView | undefined => s.reviews[norm(path)]
const NO_REVIEWS: ReviewSummary[] = []
export const selectReviewList = (path: string) => (s: AppState) => s.reviewList[norm(path)] ?? NO_REVIEWS
