import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { actions, DEFAULT_PREFS, firstGraphPage, runningLabel, selectActiveTab, submodulePath, useApp } from './app'

Object.assign(globalThis, { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } })

const info = (path: string) => ({
  path, name: path.split('/').pop(), head: { kind: 'branch', name: 'main', upstream: null },
  toolbar: { remotes: [], ahead: null, behind: null, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
  undo: { undo: { enabled: false, label: null, reason: null }, redo: { enabled: false, label: null, reason: null } },
})

function fakeCore(answers: Record<string, (args: Record<string, unknown>) => unknown> = {}) {
  const calls: { cmd: string; args: Record<string, unknown> }[] = []
  Object.assign(globalThis, { window: { __mnemo: {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      calls.push({ cmd, args })
      if (answers[cmd]) return answers[cmd](args)
      if (cmd === 'open_repository') return info(args.path as string)
      if (cmd === 'graph_page') return { rows: [], next: null }
      return null
    },
    listen: () => () => {},
  } } })
  return calls
}

const noArgs = { hidden: [], solo: null, smart: false, dateOrder: false, highlight: null }

beforeEach(() => {
  useApp.setState({ tabs: [], activePath: null, running: {}, views: {}, reviews: {}, pushPrompt: null, toasts: [], prefs: DEFAULT_PREFS })
})

test('submodulePath junta o pai e o nome sem barra duplicada', () => {
  assert.equal(submodulePath('/repo', 'libs/x'), '/repo/libs/x')
  assert.equal(submodulePath('/repo/', 'x'), '/repo/x')
  assert.equal(submodulePath('C:\\repo\\', 'x'), 'C:\\repo/x')
})

test('abrir o mesmo repositório duas vezes mantém uma só aba', async () => {
  fakeCore()
  await actions.openRepository('/a')
  await actions.openRepository('/a')
  assert.deepEqual(useApp.getState().tabs.map((t) => t.path), ['/a'])
  assert.equal(useApp.getState().activePath, '/a')
})

test('reabrir uma aba existente preserva o filtro de autores', async () => {
  fakeCore()
  await actions.openRepository('/a')
  actions.setAuthorFilter('/a', ['ana'])
  await actions.openRepository('/a')
  assert.deepEqual(useApp.getState().tabs[0]!.authors, ['ana'])
})

test('abrir submódulo guarda o pai na aba', async () => {
  fakeCore()
  await actions.openSubmodule('/p', 'sub')
  const tab = useApp.getState().tabs[0]!
  assert.equal(tab.path, '/p/sub')
  assert.equal(tab.parent, '/p')
})

test('submódulo não iniciado não abre aba e avisa com erro', async (t) => {
  t.mock.timers.enable({ apis: ['setTimeout'] })
  fakeCore({ open_repository: () => info('/p') })
  await actions.openSubmodule('/p', 'sub')
  const { tabs, toasts } = useApp.getState()
  assert.equal(tabs.length, 0)
  assert.equal(toasts[0]!.error, true)
  assert.match(toasts[0]!.text, /sub não foi iniciado/)
})

test('fechar a aba ativa ativa a última restante e avisa o core', async () => {
  const calls = fakeCore()
  for (const p of ['/a', '/b', '/c']) await actions.openRepository(p)
  actions.focusTab('/c')
  actions.closeTab('/c')
  assert.deepEqual(useApp.getState().tabs.map((t) => t.path), ['/a', '/b'])
  assert.equal(useApp.getState().activePath, '/b')
  assert.deepEqual(calls.filter((c) => c.cmd === 'close_repository').map((c) => c.args.path), ['/c'])
})

test('fechar outra aba mantém a ativa', async () => {
  fakeCore()
  for (const p of ['/a', '/b']) await actions.openRepository(p)
  actions.focusTab('/a')
  actions.closeTab('/b')
  assert.equal(useApp.getState().activePath, '/a')
})

test('fechar a última aba zera a aba ativa', async () => {
  fakeCore()
  await actions.openRepository('/a')
  actions.closeTab('/a')
  assert.equal(useApp.getState().activePath, null)
  assert.equal(selectActiveTab(useApp.getState()), undefined)
})

test('fechar a aba descarta a seleção de commit dela e mantém a das outras', async () => {
  fakeCore()
  for (const p of ['/a', '/b']) await actions.openRepository(p)
  actions.selectCommit('/a', 'aaa')
  actions.selectCommit('/b', 'bbb')
  actions.closeTab('/a')
  assert.deepEqual(Object.keys(useApp.getState().views), ['/b'])
})

test('fechar a aba cancela o pedido de push pendente dela, não o de outra', async () => {
  fakeCore()
  for (const p of ['/a', '/b']) await actions.openRepository(p)
  useApp.setState({ pushPrompt: { path: '/a' } as never })
  actions.closeTab('/b')
  assert.equal(useApp.getState().pushPrompt?.path, '/a')
  actions.closeTab('/a')
  assert.equal(useApp.getState().pushPrompt, null)
})

test('selecionar outro commit fecha o diff; reselecionar o mesmo mantém', () => {
  const diff = { path: '/a' } as never
  actions.selectCommit('/a', 'x')
  actions.openDiff(diff)
  actions.selectCommit('/a', 'x')
  assert.equal(useApp.getState().views['/a']!.diff, diff)
  actions.selectCommit('/a', 'y')
  assert.equal(useApp.getState().views['/a']!.diff, null)
})

test('abrir diff fecha o editor de conflito e abrir conflito fecha o diff', () => {
  actions.openConflict('/a', 'f.txt')
  actions.openDiff({ path: '/a' } as never)
  assert.equal(useApp.getState().views['/a']!.conflict, null)
  actions.openConflict('/a', 'f.txt')
  assert.equal(useApp.getState().views['/a']!.diff, null)
  assert.deepEqual(useApp.getState().views['/a']!.conflict, { path: '/a', file: 'f.txt' })
})

test('seletores acham a aba e a Operação em curso pelo caminho com barras invertidas', () => {
  useApp.setState({ tabs: [info('C:/r') as never], activePath: 'C:\\r', running: { 'C:/r': 'Fazendo push…' } })
  assert.equal(selectActiveTab(useApp.getState())?.path, 'C:/r')
  assert.equal(runningLabel(useApp.getState(), 'C:\\r'), 'Fazendo push…')
})

test('firstGraphPage reaproveita a 1ª página pedida ao abrir a aba, uma única vez', async () => {
  const calls = fakeCore()
  await actions.openRepository('/a')
  await firstGraphPage('/a', noArgs)
  assert.equal(calls.filter((c) => c.cmd === 'graph_page').length, 1)
  await firstGraphPage('/a', noArgs)
  assert.equal(calls.filter((c) => c.cmd === 'graph_page').length, 2)
})

test('firstGraphPage pede de novo quando os argumentos de visibilidade diferem do prefetch', async () => {
  const calls = fakeCore()
  await actions.openRepository('/a')
  await firstGraphPage('/a', { ...noArgs, solo: 'refs/heads/x' })
  assert.equal(calls.filter((c) => c.cmd === 'graph_page').length, 2)
  assert.equal((calls.at(-1)!.args.visibility as { solo: string }).solo, 'refs/heads/x')
})

test('firstGraphPage descarta o prefetch com mais de 5 segundos', async (t) => {
  t.mock.timers.enable({ apis: ['Date'], now: 0 })
  const calls = fakeCore()
  await actions.openRepository('/a')
  t.mock.timers.tick(5001)
  await firstGraphPage('/a', noArgs)
  assert.equal(calls.filter((c) => c.cmd === 'graph_page').length, 2)
})
