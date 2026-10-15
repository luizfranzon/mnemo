import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAYOUT, dragColumnWidth, gridTemplate, moveColumn, sanitize, segmentPath } from './graphColumns'

test('padrão: Descrição oculta; Mensagem flexível com mínimo de 200px', () => {
  assert.equal(gridTemplate(DEFAULT_LAYOUT), 'minmax(70px, 190px) minmax(56px, 144px) minmax(200px, 1fr) minmax(60px, 120px) minmax(100px, 150px) minmax(56px, 70px)')
})

test('arrasto nunca deixa a Mensagem abaixo de 200px nem a coluna abaixo do mínimo', () => {
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'refs', 5000, 1000), 1000 - 144 - 120 - 150 - 70 - 200)
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'refs', 10, 1000), 70)
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'refs', 10, 1000, { refsMin: 150 }), 150, 'a Branch / Tag não fica menor que a maior pill')
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'graph', 500, 1000, { graphMax: 90 }), 90, 'o Grafo não passa da largura do conteúdo')
})

test('layout salvo inválido volta ao padrão; graph e message não ficam ocultas', () => {
  const l = sanitize({ order: ['sha'] as never, hidden: ['graph', 'message', 'sha'] as never, widths: { refs: 5, author: 200 }, compact: true })
  assert.deepEqual(l.order, DEFAULT_LAYOUT.order)
  assert.deepEqual(l.hidden, ['sha'])
  assert.deepEqual(l.widths, { refs: 70, author: 200 })
  assert.equal(l.compact, true)
})

test('reordenar troca com o vizinho e para nas pontas', () => {
  assert.deepEqual(moveColumn(['refs', 'graph', 'message', 'description', 'author', 'date', 'sha'], 'graph', -1).slice(0, 2), ['graph', 'refs'])
  assert.equal(moveColumn(DEFAULT_LAYOUT.order, 'refs', -1), DEFAULT_LAYOUT.order)
})

test('segmentos fazem canto de 90° arredondado: reta, curva de raio ≤ 8 e reta', () => {
  const geo = { lane: 16, first: 12 }
  assert.equal(segmentPath({ fromLane: 0, toLane: 0, kind: 'pass' }, geo), 'M12 0 V28')
  assert.equal(segmentPath({ fromLane: 0, toLane: 0, kind: 'parent' }, geo), 'M12 14 V28')
  assert.equal(segmentPath({ fromLane: 1, toLane: 0, kind: 'incoming' }, geo), 'M28 0 V6 Q28 14 20 14 H12')
  assert.equal(segmentPath({ fromLane: 0, toLane: 2, kind: 'parent' }, geo), 'M12 14 H36 Q44 14 44 22 V28')
  assert.equal(segmentPath({ fromLane: 2, toLane: 1, kind: 'parent' }, { lane: 4, first: 0 }), 'M8 14 H8 Q4 14 4 18 V28')
})
