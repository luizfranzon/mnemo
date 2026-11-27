import { test } from 'node:test'
import assert from 'node:assert/strict'
import { overwrittenPaths } from './overwritten'

test('lista os arquivos untracked que o merge sobrescreveria', () => {
  const stderr = 'error: The following untracked working tree files would be overwritten by merge:\n\tlefthook.yml\n\ta/b.txt\nPlease move or remove them before you merge.\nAborting'
  assert.deepEqual(overwrittenPaths(stderr), ['lefthook.yml', 'a/b.txt'])
})

test('devolve vazio para outro erro do git', () => {
  assert.deepEqual(overwrittenPaths('fatal: refusing to merge unrelated histories'), [])
})
