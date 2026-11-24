import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tabLabel, tabParts } from './tabLabel'
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

test('partes da aba de repositório: pasta e branch do HEAD', () => {
  const main = { ...tab('/r/mnemo'), head: onBranch('main') }
  assert.deepEqual(tabParts([main], '/r/mnemo'), { name: 'mnemo', branch: 'main', worktree: false })
})

test('partes da aba de worktree: repo principal, branch e marca de worktree', () => {
  const tabs = [worktree('/w/mnemo-x', onBranch('feat/x'))]
  assert.deepEqual(tabParts(tabs, '/w/mnemo-x'), { name: 'mnemo', branch: 'feat/x', worktree: true })
})

test('partes com HEAD destacado: sha curto no repositório e pasta no worktree', () => {
  const detached: HeadInfo = { kind: 'detached', sha: 'abc1234def' }
  assert.equal(tabParts([{ ...tab('/r/mnemo'), head: detached }], '/r/mnemo')?.branch, 'abc1234')
  assert.equal(tabParts([worktree('/w/hotfix-tmp', detached)], '/w/hotfix-tmp')?.branch, 'hotfix-tmp')
})

test('partes de abas com o mesmo nome ganham o trecho do pai no repo', () => {
  const tabs = [
    { ...tab('/r/docs/MobileCore'), head: onBranch('develop') },
    { ...tab('/r/projects/MobileCore'), head: onBranch('develop') },
  ]
  assert.equal(tabParts(tabs, '/r/projects/MobileCore')?.name, 'MobileCore — projects')
})

test('aba que não está aberta não tem partes', () => {
  assert.equal(tabParts([], '/r/x'), undefined)
})
