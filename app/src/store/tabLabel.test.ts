import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tabLabel } from './tabLabel'
import type { HeadInfo } from '../bridge/types'

const tab = (path: string) => ({ path, name: path.split(/[\\/]/).pop()! })

test('nome único fica só com o nome da pasta', () => {
  assert.equal(tabLabel([tab('/r/docs/MobileCore'), tab('/r/mnemo')], '/r/mnemo'), 'mnemo')
})

test('nomes repetidos ganham o menor trecho do pai que os diferencia', () => {
  const tabs = [tab('/r/docs/MobileCore'), tab('/r/projects/MobileCore')]
  assert.equal(tabLabel(tabs, '/r/projects/MobileCore'), 'MobileCore — projects')
  assert.equal(tabLabel(tabs, '/r/docs/MobileCore'), 'MobileCore — docs')
})

test('pais iguais: sobe até diferir', () => {
  const tabs = [tab('/a/x/MobileCore'), tab('/b/x/MobileCore'), tab('C:\\c\\x\\MobileCore')]
  assert.equal(tabLabel(tabs, '/a/x/MobileCore'), 'MobileCore — a/x')
  assert.equal(tabLabel(tabs, 'C:\\c\\x\\MobileCore'), 'MobileCore — c/x')
})

test('aba que não está aberta não tem nome', () => {
  assert.equal(tabLabel([], '/r/x'), undefined)
})

const worktree = (path: string, head: HeadInfo) => ({ ...tab(path), mainRepoName: 'mnemo', head })
const onBranch = (name: string): HeadInfo => ({ kind: 'branch', name, upstream: null })

test('worktree vira repo - branch e acompanha a branch atual', () => {
  assert.equal(tabLabel([worktree('/w/mnemo-x', onBranch('feat/x'))], '/w/mnemo-x'), 'mnemo - feat/x')
  assert.equal(tabLabel([worktree('/w/mnemo-x', onBranch('feat/y'))], '/w/mnemo-x'), 'mnemo - feat/y')
})

test('worktree com HEAD destacado vira repo - pasta', () => {
  assert.equal(tabLabel([worktree('/w/hotfix-tmp', { kind: 'detached', sha: 'abc1234' })], '/w/hotfix-tmp'), 'mnemo - hotfix-tmp')
})

test('rótulos de worktree iguais ganham o trecho do pai', () => {
  const tabs = [worktree('/a/w', onBranch('feat/x')), worktree('/b/w', onBranch('feat/x'))]
  assert.equal(tabLabel(tabs, '/a/w'), 'mnemo - feat/x — a')
})
