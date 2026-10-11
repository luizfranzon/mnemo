import { test } from 'node:test'
import assert from 'node:assert/strict'
import { dragWidth } from './panelLayout'

test('arrasto respeita mínimo, máximo e centro ≥ 480', () => {
  assert.equal(dragWidth('left', 300, 2000), 300)
  assert.equal(dragWidth('left', 900, 2000), 420)
  assert.equal(dragWidth('left', 190, 2000), 200) // um pouco abaixo do mínimo ainda não recolhe
  assert.equal(dragWidth('right', 600, 1000), 520) // 1000 - 480 de centro
  assert.equal(dragWidth('right', 600, 700), 300) // sem espaço: o mínimo vence
})

test('arrastar até o mínimo recolhe', () => {
  assert.equal(dragWidth('left', 100, 2000), null)
  assert.equal(dragWidth('right', 0, 2000), null)
})
