import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { actions, commitOptions, DEFAULT_PREFS, loadPrefs, selectRepoPrefs, useApp } from './app'
import { graphVisibility, EMPTY } from './visibility'

const storage = new Map<string, string>()
Object.assign(globalThis, { localStorage: {
  getItem: (k: string) => storage.get(k) ?? null,
  setItem: (k: string, v: string) => void storage.set(k, v),
  removeItem: (k: string) => void storage.delete(k),
} })

const info = (path: string) => ({
  path, name: path.slice(1), head: { kind: 'branch', name: 'main', upstream: null },
  toolbar: { remotes: [], ahead: null, behind: null, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
  undo: { undo: { enabled: false, label: null, reason: null }, redo: { enabled: false, label: null, reason: null } },
})

/** Core falso: registra as chamadas e responde o mínimo de cada comando. */
function fakeCore(answers: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = []
  Object.assign(globalThis, { window: { __mnemo: {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      calls.push({ cmd, args })
      if (answers[cmd]) return answers[cmd](args)
      if (cmd === 'open_repository') return info(args.path as string)
      if (cmd === 'initial_paths') return []
      if (cmd === 'execute_operation') return { status: 'completed', opId: null, warnings: [], state: info('/x').undo }
      return null
    },
    listen: () => () => {},
  } } })
  return calls
}

beforeEach(() => {
  storage.clear()
  useApp.setState({ tabs: [], activePath: null, running: {}, prefs: DEFAULT_PREFS, repoPrefs: {} })
})

test('loadPrefs usa o padrão sem nada salvo', () => {
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS)
  assert.deepEqual(DEFAULT_PREFS, { gravatar: true, dateOrder: false, rememberTabs: true, prune: true, doubleClickCheckout: true, ghostRefs: true })
})

test('loadPrefs lê os booleanos salvos e ignora valores que não são booleanos', () => {
  storage.set('mnemo.prefs', JSON.stringify({ dateOrder: true, prune: false, ghostRefs: 'não', rememberTabs: 0 }))
  const prefs = loadPrefs()
  assert.equal(prefs.dateOrder, true)
  assert.equal(prefs.prune, false)
  assert.equal(prefs.ghostRefs, true)
  assert.equal(prefs.rememberTabs, true)
})

test('loadPrefs volta ao padrão com JSON corrompido', () => {
  storage.set('mnemo.prefs', '{quebrado')
  assert.deepEqual(loadPrefs(), DEFAULT_PREFS)
})

test('setPref atualiza o estado e grava em mnemo.prefs', () => {
  actions.setPref('doubleClickCheckout', false)
  assert.equal(useApp.getState().prefs.doubleClickCheckout, false)
  assert.equal(loadPrefs().doubleClickCheckout, false)
})

test('com Lembrar abas ligado, reabre as abas da sessão anterior', async () => {
  storage.set('mnemo.session', JSON.stringify({ paths: ['/a', '/b'], active: '/a' }))
  const calls = fakeCore()
  await actions.openInitialPaths()
  assert.deepEqual(calls.filter((c) => c.cmd === 'open_repository').map((c) => c.args.path), ['/a', '/b'])
  assert.equal(useApp.getState().activePath, '/a')
})

test('com Lembrar abas desligado, não reabre a sessão anterior', async () => {
  storage.set('mnemo.session', JSON.stringify({ paths: ['/a', '/b'], active: '/a' }))
  useApp.setState({ prefs: { ...DEFAULT_PREFS, rememberTabs: false } })
  const calls = fakeCore()
  await actions.openInitialPaths()
  assert.equal(calls.filter((c) => c.cmd === 'open_repository').length, 0)
  assert.deepEqual(useApp.getState().tabs, [])
})

test('fetch leva o Auto-prune das preferências para o core', async () => {
  const calls = fakeCore()
  await actions.execute('/r', { type: 'fetch', remote: null })
  useApp.setState({ prefs: { ...DEFAULT_PREFS, prune: false } })
  await actions.execute('/r', { type: 'fetch', remote: 'origin' })
  const kinds = calls.filter((c) => c.cmd === 'execute_operation').map((c) => c.args.kind)
  assert.deepEqual(kinds, [{ type: 'fetch', remote: null, prune: true }, { type: 'fetch', remote: 'origin', prune: false }])
})

test('Auto-prune não altera as outras Operações', async () => {
  const calls = fakeCore()
  await actions.execute('/r', { type: 'pull', strategy: 'merge' })
  assert.deepEqual(calls.find((c) => c.cmd === 'execute_operation')?.args.kind, { type: 'pull', strategy: 'merge' })
})

test('Ordem dos commits por data chega ao core na visibilidade do grafo', () => {
  assert.equal(graphVisibility(EMPTY, true).dateOrder, true)
  assert.equal(graphVisibility(EMPTY).dateOrder, false)
})

test('setRepoPref grava pelo core e guarda as prefs devolvidas do repositório', async () => {
  const saved = { pushAfterCommit: false, skipHooks: true, signCommits: false }
  const calls = fakeCore({ set_repo_pref: () => saved })
  await actions.setRepoPref('/r', 'skipHooks', true)
  assert.deepEqual(calls.find((c) => c.cmd === 'set_repo_pref')?.args, { path: '/r', key: 'skipHooks', value: true })
  assert.deepEqual(selectRepoPrefs('/r')(useApp.getState()), saved)
})

test('loadRepoPrefs lê as prefs do repositório pelo core', async () => {
  const saved = { pushAfterCommit: true, skipHooks: false, signCommits: true }
  fakeCore({ repo_prefs: () => saved })
  await actions.loadRepoPrefs('/r')
  assert.deepEqual(selectRepoPrefs('/r')(useApp.getState()), saved)
})

test('commitOptions vira o padrão das Opções de commit', () => {
  assert.deepEqual(commitOptions(undefined), { sign: false, hooks: true, pushAfter: false })
  assert.deepEqual(commitOptions({ pushAfterCommit: true, skipHooks: true, signCommits: true }), { sign: true, hooks: false, pushAfter: true })
  assert.deepEqual(commitOptions({ pushAfterCommit: false, skipHooks: false, signCommits: false }), { sign: false, hooks: true, pushAfter: false })
})
