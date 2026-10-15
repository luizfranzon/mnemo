import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DiffLine, FileDiff } from '../bridge/types'
import { diffRows, highlight, markers, selectionArgs } from './diffModel'

const line = (kind: DiffLine['kind'], text: string, hunk: number | null = 0): DiffLine =>
  ({ kind, text, old: kind === 'add' ? null : 1, new: kind === 'del' ? null : 1, noNewline: false, hunk })

function diff(lines: DiffLine[]): FileDiff {
  const hunks = [...new Set(lines.map((l) => l.hunk).filter((h) => h !== null))].map((h) => {
    const start = lines.findIndex((l) => l.hunk === h)
    return { header: `@@ ${h} @@`, oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, start, len: lines.filter((l) => l.hunk === h).length }
  })
  return { path: 'a.ts', oldPath: null, binary: false, tooLarge: false, encoding: 'UTF-8', encodingId: 'utf-8', guessed: false, stageable: true, added: 0, removed: 0, hunks, lines }
}

test('trechos: cabeçalho do trecho e depois as linhas', () => {
  const d = diff([line('context', 'a'), line('del', 'b'), line('add', 'B')])
  assert.deepEqual(diffRows(d, 'hunks').map((r) => r.type === 'hunk' ? `h${r.hunk}` : `l${r.type === 'line' ? r.line : ''}`), ['h0', 'l0', 'l1', 'l2'])
})

test('lado a lado: remoções e adições do mesmo bloco ficam na mesma linha; sobra vira vazio', () => {
  const d = diff([line('context', 'a'), line('del', 'b'), line('del', 'c'), line('add', 'B'), line('context', 'd'), line('add', 'e')])
  const rows = diffRows(d, 'split').filter((r) => r.type === 'split')
  assert.deepEqual(rows.map((r) => r.type === 'split' && [r.left, r.right]), [[0, 0], [1, 3], [2, null], [4, 4], [null, 5]])
})

test('inline: linhas fora de trecho entram sem cabeçalho próprio', () => {
  const d = diff([line('context', 'x', null), line('add', 'y', 0), line('context', 'z', null)])
  assert.deepEqual(diffRows(d, 'inline').map((r) => r.type), ['line', 'hunk', 'line', 'line'])
})

test('marcadores juntam linhas seguidas do mesmo tipo, em fração da altura', () => {
  const d = diff([line('context', 'a'), line('del', 'b'), line('add', 'c'), line('add', 'd')])
  const rows = diffRows(d, 'hunks')
  assert.deepEqual(markers(d, rows), [{ kind: 'del', top: 2 / 5, height: 1 / 5 }, { kind: 'add', top: 3 / 5, height: 2 / 5 }])
})

test('seleção vira (trecho, linha no trecho) e ignora contexto', () => {
  const d = diff([line('context', 'a', 0), line('add', 'b', 0), line('context', 'gap', null), line('del', 'c', 1)])
  assert.deepEqual(selectionArgs(d, new Set([0, 1, 2, 3])), [[0, 1], [1, 0]])
})

test('highlight separa palavra-chave, string, tipo, constante e pontuação', () => {
  const parts = highlight('const X_Y: Foo = "s"')
  assert.deepEqual(parts.filter((p) => p.c !== 'default').map((p) => `${p.c}:${p.t}`),
    ['keyword:const', 'constant:X_Y', 'punctuation::', 'type:Foo', 'keyword:=', 'string:"s"'])
  assert.equal(parts.map((p) => p.t).join(''), 'const X_Y: Foo = "s"')
})

test('highlight marca chamada, this, literal, número, operador e nome declarado como no tema Dracula', () => {
  const text = 'private readonly node = computed<Node | null>(() => this.data()?.type ?? 1)'
  const parts = highlight(text)
  assert.deepEqual(parts.filter((p) => p.c !== 'default' && p.c !== 'punctuation').map((p) => `${p.c}:${p.t}`),
    ['keyword:private', 'keyword:readonly', 'constant:node', 'keyword:=', 'function:computed', 'keyword:<', 'type:Node', 'keyword:|',
      'constant:null', 'keyword:>', 'keyword:=>', 'constant:this', 'function:data', 'keyword:??', 'constant:1'])
  assert.equal(parts.map((p) => p.t).join(''), text)
})
