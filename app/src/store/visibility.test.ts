import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY, graphVisibility, sanitize, toggleHidden, toggleHighlight, toggleSolo } from './visibility'

test('Ocultar alterna e é desfeito pelo Solo da mesma branch', () => {
  const hidden = toggleHidden(EMPTY, 'refs/heads/a')
  assert.deepEqual(hidden.hidden, ['refs/heads/a'])
  assert.deepEqual(toggleHidden(hidden, 'refs/heads/a').hidden, [])
  const solo = toggleSolo(hidden, 'refs/heads/a')
  assert.equal(solo.solo, 'refs/heads/a')
  assert.deepEqual(solo.hidden, [])
  assert.equal(toggleSolo(solo, 'refs/heads/a').solo, null)
})

test('Destacar vale para uma branch só, alterna e vai para o core', () => {
  const a = toggleHighlight(EMPTY, 'refs/heads/a')
  assert.equal(a.highlight, 'refs/heads/a')
  assert.equal(toggleHighlight(a, 'refs/heads/b').highlight, 'refs/heads/b')
  assert.equal(toggleHighlight(a, 'refs/heads/a').highlight, null)
  assert.deepEqual(graphVisibility(a), { hidden: [], solo: null, smart: false, dateOrder: false, highlight: 'refs/heads/a' })
})

test('Ocultar ou Solo não apagam o destaque', () => {
  const v = toggleSolo(toggleHighlight(EMPTY, 'refs/heads/a'), 'refs/heads/b')
  assert.equal(v.highlight, 'refs/heads/a')
  assert.equal(toggleHidden(v, 'refs/heads/a').highlight, 'refs/heads/a')
})

test('sanitize descarta lixo salvo', () => {
  assert.deepEqual(sanitize({ hidden: ['x', 3 as never], solo: 7 as never, highlight: 5 as never, pinned: ['refs/heads/velha'], smart: 'sim' as never } as never), { hidden: ['x'], solo: null, highlight: null, smart: false })
})
