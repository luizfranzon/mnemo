import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { ConflictDoc } from '../bridge/types'
import { initialPicks, output, takeSide, unresolved } from './conflictModel'

const doc: ConflictDoc = {
  path: 'a.txt', finalNewline: true,
  segments: [
    { kind: 'text', lines: ['1'] },
    { kind: 'conflict', ours: ['main', 'x'], theirs: ['feat'], base: ['2'], auto: false },
    { kind: 'text', lines: ['3'] },
    { kind: 'conflict', ours: ['a  b'], theirs: ['a b'], base: [], auto: true },
  ],
}

test('trecho que só difere em espaço começa resolvido com o Atual', () => {
  const picks = initialPicks(doc)
  assert.equal(unresolved(picks), 1)
  assert.equal(output(doc, picks, true), '1\n<<<<<<< Atual\nmain\nx\n=======\nfeat\n>>>>>>> Entrando\n3\na  b\n')
})

test('escolher os dois lados junta Atual e depois Entrando', () => {
  const picks = initialPicks(doc)
  picks[0] = takeSide(doc.segments[1] as never, true, true)
  assert.equal(unresolved(picks), 0)
  assert.equal(output(doc, picks), '1\nmain\nx\nfeat\n3\na  b\n')
})

test('escolher só algumas linhas do Atual deixa só elas no resultado', () => {
  const picks = initialPicks(doc)
  picks[0] = { ours: [false, true], theirs: [false], touched: true }
  assert.equal(output(doc, picks), '1\nx\n3\na  b\n')
})
