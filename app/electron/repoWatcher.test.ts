import { test } from 'node:test'
import assert from 'node:assert/strict'
import { isNoise } from './repoWatcher'

test('ignora a pasta temporária que o editor de conflito cria em .git', () => {
  assert.equal(isNoise('mnemo-conflict-123-0'), true)
})

test('ignora arquivos que o git mexe a cada comando', () => {
  for (const name of ['index', 'index.lock', 'FETCH_HEAD', 'ORIG_HEAD', 'COMMIT_EDITMSG']) assert.equal(isNoise(name), true, name)
})

test('não ignora o que muda o grafo', () => {
  for (const name of ['HEAD', 'MERGE_HEAD', 'packed-refs', 'main']) assert.equal(isNoise(name), false, name)
})
