import { test } from 'node:test'
import assert from 'node:assert/strict'
import { commitMenu, fileMenu, type CommitMenuContext, type FileMenuContext } from './commitMenu'
import type { MenuEntry } from './menuModel'

const calls: unknown[] = []
const ctx = (over: Partial<CommitMenuContext> = {}): CommitMenuContext => ({
  head: { kind: 'branch', name: 'main', upstream: null },
  toolbar: { remotes: ['origin'], ahead: 0, behind: 0, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
  remoteUrl: 'git@github.com:acme/app.git',
  execute: (k) => calls.push(k), checkout: (s) => calls.push(`checkout ${s}`), newBranch: () => {}, resetHard: () => {},
  dialog: (d) => calls.push(d), copy: (t) => calls.push(t), ...over,
})
const commit = { sha: 'abcdef1234567890', subject: 'corrige o bug', head: false }
const find = (items: MenuEntry[], start: string) => items.find((i) => i !== '-' && i.label.startsWith(start)) as Exclude<MenuEntry, '-'>

test('cabeçalho com SHA e mensagem; rótulos com o nome da branch atual', () => {
  const items = commitMenu(commit, ctx())
  assert.equal(find(items, 'abcdef1').label, 'abcdef1 · corrige o bug')
  assert.equal(find(items, 'Cherry-pick').label, 'Cherry-pick em main')
  assert.equal(find(items, 'Reset').label, 'Reset main para este commit')
})

test('editar mensagem só no HEAD; checkout desabilitado no HEAD', () => {
  assert.ok(find(commitMenu(commit, ctx()), 'Editar mensagem').reason)
  const atHead = commitMenu({ ...commit, head: true }, ctx())
  assert.equal(find(atHead, 'Editar mensagem').reason, undefined)
  assert.ok(find(atHead, 'Fazer checkout').reason)
})

test('tag simples e anotada abrem o diálogo; link do GitHub aponta para o commit', () => {
  const items = commitMenu(commit, ctx())
  find(items, 'Criar tag anotada').run!()
  assert.deepEqual(calls.at(-1), { type: 'tag', sha: commit.sha, annotated: true })
  find(items, 'Copiar link').run!()
  assert.equal(calls.at(-1), 'https://github.com/acme/app/commit/abcdef1234567890')
  assert.ok(find(commitMenu(commit, ctx({ remoteUrl: null })), 'Copiar link').reason)
})

test('Operação em curso desabilita tudo que muda o repositório, não o Copiar SHA', () => {
  const items = commitMenu(commit, ctx({ mutation: 'Aguarde terminar.' }))
  for (const l of ['Fazer checkout', 'Cherry-pick', 'Revert', 'Reset', 'Criar tag']) assert.ok(find(items, l).reason, l)
  assert.equal(find(items, 'Copiar SHA').reason, undefined)
})

test('menu do arquivo: restaurar (âmbar) e excluir (vermelho) abrem confirmação; restaurar some em arquivo removido', () => {
  const fctx: FileMenuContext = { remoteUrl: null, absolute: 'C:\\repo\\src\\a.ts', open: (h) => calls.push(`open ${h}`), dialog: (d) => calls.push(d), copy: (t) => calls.push(t) }
  const file = { path: 'src/a.ts', oldPath: null, status: 'M' as const, added: 1, removed: 0 }
  const items = fileMenu(commit.sha, file, fctx)
  const restore = find(items, 'Restaurar')
  assert.ok(restore.warn && find(items, 'Excluir').danger)
  restore.run!()
  assert.deepEqual(calls.at(-1), { type: 'restoreFile', sha: commit.sha, file: 'src/a.ts' })
  find(items, 'Copiar caminho relativo').run!()
  assert.equal(calls.at(-1), 'src/a.ts')
  assert.ok(find(fileMenu(commit.sha, { ...file, status: 'D' }, fctx), 'Restaurar').reason)
})
