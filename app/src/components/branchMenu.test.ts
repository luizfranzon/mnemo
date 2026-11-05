import { test } from 'node:test'
import assert from 'node:assert/strict'
import { branchMenu, githubBranchUrl, splitUpstream, type BranchMenuContext } from './branchMenu'
import type { MenuEntry } from './menuModel'

const calls: unknown[] = []
const ctx = (over: Partial<BranchMenuContext> = {}): BranchMenuContext => ({
  head: { kind: 'branch', name: 'main', upstream: 'origin/main' },
  toolbar: { remotes: ['origin'], ahead: 0, behind: 0, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
  remoteUrl: 'git@github.com:acme/app.git',
  execute: (k) => calls.push(k), checkout: () => calls.push('checkout'), pull: () => {}, push: () => {}, newBranch: () => {},
  resetHard: () => {}, review: (b) => calls.push(`review:${b}`), dialog: (d) => calls.push(d), copy: (t) => calls.push(t),
  view: { hidden: false, solo: false, highlight: false }, toggleView: (w) => calls.push(w), ...over,
})
const local = { name: 'feat', sha: 'abcdef1234', current: false, upstream: 'origin/feat', ahead: 2, behind: 0 }
const find = (items: MenuEntry[], start: string) => items.find((i) => i !== '-' && i.label.startsWith(start)) as Exclude<MenuEntry, '-'>

test('rótulos com os nomes e cabeçalho com ↑↓ e upstream', () => {
  const items = branchMenu({ kind: 'local', ref: local }, ctx())
  assert.equal(find(items, 'feat ·').label, 'feat · ↑2 ↓0 · rastreia origin/feat')
  assert.equal(find(items, 'Merge').label, 'Merge feat em main')
  assert.equal(find(items, 'Rebase').label, 'Rebase main sobre feat')
})

test('revisar usa o nome sem o remoto: local e remota são a mesma Revisão', () => {
  find(branchMenu({ kind: 'remote', ref: { remote: 'origin', name: 'feat/x', sha: 'abcdef1234', localExists: false } }, ctx()), 'Revisar').run!()
  assert.equal(calls.at(-1), 'review:feat/x')
  assert.equal(find(branchMenu({ kind: 'local', ref: local }, ctx()), 'Revisar').label, 'Revisar feat')
})

test('branch atual: merge/rebase/checkout desabilitados com motivo; excluir sem remota também', () => {
  const items = branchMenu({ kind: 'local', ref: { ...local, name: 'main', current: true, upstream: null } }, ctx())
  for (const l of ['Merge', 'Rebase', 'Fazer checkout', 'Excluir']) assert.ok(find(items, l).reason, l)
})

test('ref remota não tem Pull/Push/Renomear e exclui só a remota quando não há local', () => {
  const items = branchMenu({ kind: 'remote', ref: { remote: 'origin', name: 'x', sha: 'abcdef1234', localExists: false } }, ctx())
  assert.equal(items.some((i) => i !== '-' && /^(Pull|Push|Renomear)/.test(i.label)), false)
  find(items, 'Excluir').run!()
  assert.deepEqual(calls.at(-1), { type: 'delete', from: 'remote', local: null, remote: { remote: 'origin', branch: 'x' } })
})

test('Operação em curso desabilita as ações e Copiar nome continua', () => {
  const items = branchMenu({ kind: 'local', ref: local }, ctx({ mutation: 'Executando checkout. Aguarde terminar.' }))
  assert.ok(find(items, 'Merge').reason)
  assert.equal(find(items, 'Copiar nome').reason, undefined)
})

test('link do GitHub: ssh, https, e remoto de outro serviço desabilitado', () => {
  assert.equal(githubBranchUrl('git@github.com:acme/app.git', 'feature/x'), 'https://github.com/acme/app/tree/feature/x')
  assert.equal(githubBranchUrl('https://user@github.com/acme/app', 'main'), 'https://github.com/acme/app/tree/main')
  assert.equal(githubBranchUrl('https://gitlab.com/acme/app.git', 'main'), null)
  assert.ok(find(branchMenu({ kind: 'local', ref: local }, ctx({ remoteUrl: null })), 'Copiar link').reason)
})

test('upstream com barra no nome da branch usa o remoto configurado', () => {
  assert.deepEqual(splitUpstream('origin/feature/x', ['origin']), { remote: 'origin', branch: 'feature/x' })
})

test('Ocultar, Solo e Destacar alternam e o rótulo acompanha o estado', () => {
  const items = branchMenu({ kind: 'local', ref: local }, ctx())
  find(items, 'Ocultar no grafo').run!()
  find(items, 'Solo').run!()
  find(items, 'Destacar no grafo').run!()
  assert.deepEqual(calls.slice(-3), ['hidden', 'solo', 'highlight'])
  const on = branchMenu({ kind: 'local', ref: local }, ctx({ view: { hidden: true, solo: true, highlight: true } }))
  for (const l of ['Mostrar no grafo', 'Sair do Solo', 'Remover destaque']) assert.ok(find(on, l), l)
})
