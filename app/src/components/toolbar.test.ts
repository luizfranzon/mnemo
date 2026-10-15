import { test } from 'node:test'
import assert from 'node:assert/strict'
import { actions, useApp, type Tab } from '../store/app'
import { toolbarAvailability } from './toolbarModel'

const tab: Tab = {
  path: '/repo', name: 'repo', head: { kind: 'branch', name: 'feature', upstream: null },
  toolbar: { remotes: ['company', 'personal'], ahead: null, behind: null, lastFetchEpoch: null, stashCount: 0, pullMode: 'rebase', progress: null },
  undo: { undo: { enabled: false, label: null, reason: 'Nada para desfazer' }, redo: { enabled: false, label: null, reason: 'Nada para refazer' } },
  authors: [],
}

test('Push pede o remoto quando não há origin; cancelar não executa Operação', async () => {
  const calls: string[] = []
  Object.assign(globalThis, { window: { __mnemo: {
    invoke: async (cmd: string) => { calls.push(cmd); return tab },
    listen: () => () => {},
  } } })
  useApp.setState({ tabs: [tab], activePath: tab.path, running: {}, error: null })
  await actions.requestPush(tab.path)
  assert.deepEqual(useApp.getState().pushPrompt, { path: tab.path, branch: 'feature', remotes: ['company', 'personal'] })
  actions.cancelPush()
  assert.equal(useApp.getState().pushPrompt, null)
  assert.ok(!calls.includes('execute_operation'))
})

test('confirmar o remoto publica a branch escolhida com upstream', async () => {
  const calls: { cmd: string; args: unknown }[] = []
  Object.assign(globalThis, { window: { __mnemo: {
    invoke: async (cmd: string, args: unknown) => {
      calls.push({ cmd, args })
      if (cmd === 'execute_operation') return { status: 'completed', opId: null, warnings: [], state: tab.undo }
      return { ...tab, head: { kind: 'branch', name: 'feature', upstream: 'personal/feature' } }
    },
    listen: () => () => {},
  } } })
  useApp.setState({ tabs: [tab], activePath: tab.path, running: {}, pushPrompt: null })
  await actions.requestPush(tab.path)
  await actions.confirmPush('personal')
  assert.deepEqual(calls.find((c) => c.cmd === 'execute_operation')?.args, {
    path: '/repo', kind: { type: 'push', remote: 'personal', branch: 'feature', setUpstream: true },
  })
  assert.equal(useApp.getState().pushPrompt, null)
  assert.deepEqual(useApp.getState().tabs[0]?.head, { kind: 'branch', name: 'feature', upstream: 'personal/feature' })
})

test('sem upstream mantém o padrão Pull, permite Fetch e explica o bloqueio', () => {
  const state = toolbarAvailability(tab.head, tab.toolbar)
  assert.equal(state.pull, 'Esta branch não tem upstream')
  assert.equal(state.fetch, undefined)
  assert.equal(state.push, undefined)
  const tracking: Tab = { ...tab, head: { kind: 'branch', name: 'main', upstream: 'company/main' } }
  assert.equal(toolbarAvailability(tracking.head, tracking.toolbar).pull, undefined)
})

test('conflito permite Fetch; execução bloqueia também Fetch e explica o motivo', () => {
  const toolbar = { ...tab.toolbar, progress: { kind: 'Rebase', step: 3, total: 7, message: null } }
  const waiting = toolbarAvailability(tab.head, toolbar)
  assert.equal(waiting.mutation, 'Conclua ou aborte o merge/rebase')
  assert.equal(waiting.pull, 'Conclua ou aborte o merge/rebase')
  assert.equal(waiting.push, 'Conclua ou aborte o merge/rebase')
  assert.equal(waiting.fetch, undefined)
  assert.equal(toolbarAvailability(tab.head, toolbar, 'Continuando…').fetch, 'Continuando… Aguarde terminar.')
})

test('HEAD destacado permite Fetch e bloqueia Pull e Push com motivos específicos', () => {
  const state = toolbarAvailability({ kind: 'detached', sha: 'abc1234' }, tab.toolbar)
  assert.equal(state.fetch, undefined)
  assert.equal(state.pull, 'HEAD destacado: crie uma branch para fazer Pull')
  assert.equal(state.push, 'HEAD destacado: não há branch para enviar')
})
