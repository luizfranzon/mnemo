import { test } from 'node:test'
import assert from 'node:assert/strict'
import { fileRows, filesUnder, filterFiles, sortFiles } from './fileTree'

const changes = [{ path: 'src/b.ts', status: 'D' }, { path: 'lib/a.ts', status: 'M' }, { path: 'z/c.ts', status: 'A' }]

test('ordenar por nome usa só o nome do arquivo', () => {
  assert.deepEqual(sortFiles(changes, 'name').map((f) => f.path), ['lib/a.ts', 'src/b.ts', 'z/c.ts'])
})

test('ordenar por status agrupa M, A, D nessa ordem', () => {
  assert.deepEqual(sortFiles(changes, 'status').map((f) => f.status), ['M', 'A', 'D'])
})

test('ordenar por caminho mantém a ordem recebida', () => {
  assert.equal(sortFiles(changes, 'path'), changes)
})

test('filtrar ignora maiúsculas e vazio devolve tudo', () => {
  assert.deepEqual(filterFiles(changes, 'lib/').map((f) => f.path), ['lib/a.ts'])
  assert.equal(filterFiles(changes, ''), changes)
})

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
