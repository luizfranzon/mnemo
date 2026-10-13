import { test } from 'node:test'
import assert from 'node:assert/strict'
import { EMPTY, graphVisibility, sanitize, toggleHidden, togglePinned, toggleSolo } from './visibility'

test('Ocultar alterna e é desfeito pelo Solo da mesma branch', () => {
  const hidden = toggleHidden(EMPTY, 'refs/heads/a')
  assert.deepEqual(hidden.hidden, ['refs/heads/a'])
  assert.deepEqual(toggleHidden(hidden, 'refs/heads/a').hidden, [])
  const solo = toggleSolo(hidden, 'refs/heads/a')
  assert.equal(solo.solo, 'refs/heads/a')
  assert.deepEqual(solo.hidden, [])
  assert.equal(toggleSolo(solo, 'refs/heads/a').solo, null)
})

test('Fixar não vai para o core', () => {
  const v = togglePinned(EMPTY, 'refs/heads/a')
  assert.deepEqual(v.pinned, ['refs/heads/a'])
  assert.deepEqual(graphVisibility(v), { hidden: [], solo: null, smart: false })
})

test('sanitize descarta lixo salvo', () => {
  assert.deepEqual(sanitize({ hidden: ['x', 3 as never], solo: 7 as never, pinned: 'a' as never, smart: 'sim' as never }), { hidden: ['x'], solo: null, pinned: [], smart: false })
})
