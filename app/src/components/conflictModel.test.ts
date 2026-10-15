import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConflictDoc } from '../bridge/types'
import { chunkStarts, conflictsOf, fileSideState, initialPicks, output, outputWithMarkers, paneRows, resultLayout, toggleFileSide, toggleLine, toggleSide, unresolved } from './conflictModel'

const doc: ConflictDoc = {
  path: 'a.txt', finalNewline: true, oursLabel: null, theirsLabel: null,
  segments: [
    { kind: 'text', lines: ['1'] },
    { kind: 'conflict', ours: ['main', 'x'], theirs: ['feat'], base: ['2'], auto: false },
    { kind: 'text', lines: ['3'] },
    { kind: 'conflict', ours: ['a  b'], theirs: ['a b'], base: [], auto: true },
  ],
}
const chunks = conflictsOf(doc)

test('trecho que só difere em espaço começa resolvido com o Atual', () => {
  const picks = initialPicks(doc)
  assert.equal(unresolved(picks), 1)
  assert.equal(output(doc, picks), '1\n2\n3\na  b\n')
})

test('trecho sem escolha mostra a base no Resultado e vira marcadores só ao gravar com marcadores', () => {
  const picks = initialPicks(doc)
  assert.equal(output(doc, picks), '1\n2\n3\na  b\n')
  assert.equal(outputWithMarkers(doc, picks), '1\n<<<<<<< Atual\nmain\nx\n=======\nfeat\n>>>>>>> Entrando\n3\na  b\n')
})

test('linhas entram no Resultado na ordem do clique', () => {
  let p = initialPicks(doc)[0]!
  p = toggleLine(p, 'theirs', 0)
  p = toggleLine(p, 'ours', 1)
  p = toggleLine(p, 'ours', 0)
  assert.equal(output(doc, [p, initialPicks(doc)[1]!]), '1\nfeat\nx\nmain\n3\na  b\n')
})

test('desmarcar tira a linha e marcar de novo põe no fim', () => {
  let p = toggleSide(initialPicks(doc)[0]!, chunks[0]!, 'ours')
  p = toggleLine(p, 'ours', 0)
  p = toggleLine(p, 'ours', 0)
  assert.deepEqual(p.order.map((t) => t.i), [1, 0])
})

test('marcar o lado do trecho pega só as linhas que faltam e desmarcar tira o lado todo', () => {
  let p = toggleLine(initialPicks(doc)[0]!, 'ours', 1)
  assert.equal(toggleSide(p, chunks[0]!, 'ours').order.length, 2)
  p = toggleSide(toggleSide(p, chunks[0]!, 'ours'), chunks[0]!, 'ours')
  assert.equal(p.order.length, 0)
  assert.equal(p.touched, true)
})

test('checkbox do cabeçalho marca o lado de todos os trechos e fica indeterminado com parte', () => {
  let picks = initialPicks(doc)
  assert.equal(fileSideState(picks, chunks, 'theirs'), 'none')
  picks = toggleFileSide(picks, chunks, 'theirs')
  assert.equal(fileSideState(picks, chunks, 'theirs'), 'all')
  assert.equal(output(doc, picks), '1\nfeat\n3\na  b\na b\n')
  assert.equal(fileSideState(picks, chunks, 'ours'), 'some')
  assert.equal(fileSideState(toggleFileSide(picks, chunks, 'theirs'), chunks, 'theirs'), 'none')
})

test('trecho sem escolha e sem base ganha uma faixa fora do texto', () => {
  const d: ConflictDoc = { ...doc, segments: [{ kind: 'text', lines: ['1'] }, { kind: 'conflict', ours: ['a'], theirs: ['b'], base: [], auto: false }, { kind: 'text', lines: ['3'] }] }
  const lay = resultLayout(d, initialPicks(d))
  assert.deepEqual(lay.empties, [{ before: 1, chunk: 0 }])
  assert.deepEqual(lay.starts, [1])
  assert.equal(output(d, initialPicks(d)), '1\n3\n')
})

test('painéis A e B alinham as linhas comuns preenchendo o lado menor do trecho', () => {
  const rows = paneRows(doc)
  assert.equal(rows.length, 1 + 2 + 1 + 1)
  assert.equal(rows[2]!.theirs, null)
  assert.deepEqual(rows[2]!.ours, { text: 'x', n: 3, i: 1 })
  assert.equal(rows[3]!.theirs!.n, 3)
  assert.deepEqual(chunkStarts(rows), [1, 4])
})
