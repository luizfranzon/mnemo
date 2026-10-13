import { test } from 'node:test'
import assert from 'node:assert/strict'
import { DEFAULT_LAYOUT, dragColumnWidth, gridTemplate, moveColumn, sanitize } from './graphColumns'

test('padrão: Descrição oculta; Mensagem flexível com mínimo de 200px', () => {
  assert.equal(gridTemplate(DEFAULT_LAYOUT), 'minmax(70px, 150px) minmax(56px, 144px) minmax(200px, 1fr) minmax(60px, 120px) minmax(70px, 104px) minmax(56px, 70px)')
})

test('arrasto nunca deixa a Mensagem abaixo de 200px nem a coluna abaixo do mínimo', () => {
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'refs', 5000, 1000), 1000 - 144 - 120 - 104 - 70 - 200)
  assert.equal(dragColumnWidth(DEFAULT_LAYOUT, 'refs', 10, 1000), 70)
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
