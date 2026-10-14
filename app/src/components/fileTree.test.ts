import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileRows, filesUnder } from './fileTree'

const files = [{ path: 'a/b/x.ts' }, { path: 'a/y.ts' }, { path: 'z.ts' }]

test('árvore: pastas antes dos arquivos, com contagem e caminho completo', () => {
  const rows = fileRows(files, 'tree', new Set(), 'u:')
  assert.deepEqual(rows.map((r) => (r.type === 'dir' ? `${r.path}(${r.count})` : r.name)), ['a(2)', 'a/b(1)', 'x.ts', 'y.ts', 'z.ts'])
  assert.equal(rows[0]!.key, 'u:dir:a')
})

test('pasta recolhida esconde tudo que está dentro', () => {
  assert.deepEqual(fileRows(files, 'tree', new Set(['dir:a'])).map((r) => r.key), ['dir:a', 'z.ts'])
})

test('caminho: lista plana com pasta e nome separados', () => {
  assert.deepEqual(fileRows(files, 'path', new Set()).map((r) => r.type === 'file' && `${r.dir}|${r.name}`), ['a/b/|x.ts', 'a/|y.ts', '|z.ts'])
})

test('filesUnder não confunde prefixo de nome com pasta', () => {
  assert.deepEqual(filesUnder([{ path: 'ab/x' }, { path: 'a/x' }], 'a').map((f) => f.path), ['a/x'])
})
