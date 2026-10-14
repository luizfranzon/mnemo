import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { FileChange } from '../bridge/types'
import type { MenuEntry } from './menuModel'
import { ignoreOptions, pickFiles, wipFilesMenu, wipFolderMenu, type WipMenuContext } from './wipMenu'

const calls: unknown[] = []
const ctx: WipMenuContext = {
  stage: (p, on) => calls.push(['stage', p, on]), discard: (p) => calls.push(['discard', p]), stash: (p) => calls.push(['stash', p]),
  ignore: (p) => calls.push(['ignore', p]), openDiff: (f) => calls.push(['diff', f.path]), copy: (t) => calls.push(['copy', t]),
}
const file = (path: string, status: FileChange['status'] = 'M'): FileChange => ({ path, oldPath: null, status, added: 1, removed: 0 })
const find = (items: MenuEntry[], start: string) => items.find((i) => i !== '-' && i.label.startsWith(start)) as Exclude<MenuEntry, '-'>

test('vários arquivos: preparar, descartar e stash agem em todos; sem itens de um arquivo só', () => {
  const items = wipFilesMenu([file('a.ts'), file('b/c.ts')], false, ctx)
  find(items, 'Preparar 2 arquivos').run!()
  assert.deepEqual(calls.at(-1), ['stage', ['a.ts', 'b/c.ts'], true])
  find(items, 'Guardar 2 arquivos no stash').run!()
  assert.deepEqual(calls.at(-1), ['stash', ['a.ts', 'b/c.ts']])
  assert.ok(find(items, 'Descartar').danger)
  assert.equal(find(items, 'Abrir diff'), undefined)
})

test('preparados não têm descartar nem ignorar', () => {
  const items = wipFilesMenu([file('a.ts', 'A')], true, ctx)
  assert.ok(find(items, 'Tirar arquivo'))
  assert.equal(find(items, 'Descartar'), undefined)
  assert.equal(find(items, 'Ignorar'), undefined)
})

test('ignorar: arquivo, extensão e pasta; rastreado fica desabilitado com o motivo', () => {
  assert.deepEqual(ignoreOptions('src/x.log').map((o) => o.pattern), ['/src/x.log', '*.log', '/src/'])
  assert.deepEqual(ignoreOptions('Makefile').map((o) => o.pattern), ['/Makefile'])
  find(wipFilesMenu([file('src/x.log', 'A')], false, ctx), 'Ignorar todos').run!()
  assert.deepEqual(calls.at(-1), ['ignore', '*.log'])
  assert.ok(find(wipFilesMenu([file('src/x.log')], false, ctx), 'Ignorar x.log').reason)
})

test('pasta: age no caminho da pasta e adiciona ao .gitignore', () => {
  const items = wipFolderMenu('src/ui', false, ctx)
  find(items, 'Descartar mudanças da pasta').run!()
  assert.deepEqual(calls.at(-1), ['discard', ['src/ui']])
  find(items, 'Adicionar pasta').run!()
  assert.deepEqual(calls.at(-1), ['ignore', '/src/ui/'])
  assert.equal(find(wipFolderMenu('src', true, ctx), 'Adicionar'), undefined)
})

test('seleção: Ctrl alterna, Shift estende do último clicado, e nunca mistura seções', () => {
  const keys = ['u:a', 'u:b', 'u:c', 'u:d']
  assert.deepEqual([...pickFiles(new Set(['u:a']), 'u:a', 'u:c', keys, { ctrl: false, shift: true })], ['u:a', 'u:b', 'u:c'])
  assert.deepEqual([...pickFiles(new Set(['u:a', 'u:b']), 'u:b', 'u:a', keys, { ctrl: true, shift: false })], ['u:b'])
  assert.deepEqual([...pickFiles(new Set(['s:x']), 's:x', 'u:b', keys, { ctrl: true, shift: false })], ['u:b'])
  assert.deepEqual([...pickFiles(new Set(['u:a', 'u:b']), 'u:b', 'u:d', keys, { ctrl: false, shift: false })], ['u:d'])
})
