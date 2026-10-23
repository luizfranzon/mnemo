import { test } from 'node:test'
import assert from 'node:assert/strict'
import { tabLabel } from './tabLabel'

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
