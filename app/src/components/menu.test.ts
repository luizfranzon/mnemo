import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { Tab } from '../store/app'
import { matchesShortcut, placeMenu, type MenuEntry } from './menuModel'
import { windowMenus, type MenuContext } from './windowMenus'

const rect = (left: number, top: number, right: number, bottom: number) => ({ left, top, right, bottom })

test('menu abre abaixo/à direita e vira para cima/esquerda sem sair da janela', () => {
  assert.deepEqual(placeMenu(rect(10, 0, 60, 34), 200, 300, 'below', 1000, 800), { left: 10, top: 34 })
  assert.deepEqual(placeMenu(rect(900, 0, 960, 34), 200, 300, 'below', 1000, 800), { left: 760, top: 34 })
  assert.deepEqual(placeMenu(rect(500, 700, 500, 700), 200, 300, 'below', 1000, 800), { left: 500, top: 400 })
  // submenu: ao lado do item; sem espaço à direita, abre à esquerda do menu pai
  assert.deepEqual(placeMenu(rect(700, 100, 900, 130), 200, 300, 'right', 1000, 800), { left: 500, top: 100 })
  // mais alto que a janela: gruda no topo (rola por dentro)
  assert.deepEqual(placeMenu(rect(10, 400, 10, 400), 200, 1200, 'below', 1000, 800), { left: 10, top: 0 })
})

test('atalho casa modificadores exatos', () => {
  const key = (key: string, mods: Partial<KeyboardEvent> = {}) => ({ key, ctrlKey: false, shiftKey: false, altKey: false, metaKey: false, ...mods }) as KeyboardEvent
  assert.ok(matchesShortcut('Ctrl+O', key('o', { ctrlKey: true })))
  assert.ok(!matchesShortcut('Ctrl+O', key('O', { ctrlKey: true, shiftKey: true })))
  assert.ok(matchesShortcut('Ctrl+Shift+T', key('T', { ctrlKey: true, shiftKey: true })))
  assert.ok(matchesShortcut('Alt+T', key('t', { altKey: true })))
  assert.ok(matchesShortcut('F11', key('F11')))
  assert.ok(matchesShortcut('Ctrl+=', key('=', { ctrlKey: true })))
  assert.ok(!matchesShortcut('Ctrl+P', key('p')))
})

const tab: Tab = {
  path: '/r',
  name: 'r',
  head: { kind: 'branch', name: 't34949', upstream: 'origin/t34949' },
  toolbar: { ahead: 0, behind: 0, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
  undo: { undo: { enabled: true, label: 'Desfazer checkout de t34949', reason: null }, redo: { enabled: false, label: null, reason: 'Nada para refazer' } },
}
const ctx = (patch: Partial<MenuContext> = {}): MenuContext => ({ tab, tabs: [tab], running: undefined, textFocus: false, ...patch })
const items = (c: MenuContext, menu: string) => windowMenus(c).find((m) => m.label === menu)!.items.filter((i): i is Exclude<MenuEntry, '-'> => i !== '-')
const item = (c: MenuContext, menu: string, label: string) => items(c, menu).find((i) => i.label.startsWith(label))

test('os cinco menus da janela, na ordem', () => {
  assert.deepEqual(windowMenus(ctx()).map((m) => m.label), ['Arquivo', 'Editar', 'Exibir', 'Repositório', 'Ajuda'])
})

test('Editar com foco em campo mostra desfazer da digitação e da Operação', () => {
  assert.deepEqual(items(ctx({ textFocus: true }), 'Editar').slice(0, 4).map((i) => i.label), ['Desfazer digitação', 'Desfazer checkout de t34949', 'Refazer digitação', 'Refazer'])
  assert.equal(item(ctx(), 'Editar', 'Desfazer digitação'), undefined)
  assert.equal(item(ctx(), 'Editar', 'Desfazer checkout')?.shortcut, 'Ctrl+Z')
  assert.equal(item(ctx(), 'Editar', 'Refazer')?.reason, 'Nada para refazer')
})

test('itens sem ação ficam desabilitados com o motivo, sem sumir', () => {
  assert.ok(item(ctx(), 'Arquivo', 'Clonar')?.reason)
  assert.equal(item(ctx({ tab: undefined, tabs: [] }), 'Arquivo', 'Fechar aba')?.reason, 'Abra um repositório')
  assert.equal(item(ctx(), 'Repositório', 'Push t34949')?.reason, undefined)
  assert.equal(item(ctx({ running: 'Fazendo push…' }), 'Repositório', 'Push')?.reason, 'Fazendo push… Aguarde terminar.')
})

test('Exibir › Abas lista as Abas abertas', () => {
  const other: Tab = { ...tab, path: '/s', name: 's' }
  assert.deepEqual(item(ctx({ tabs: [tab, other] }), 'Exibir', 'Abas')?.submenu?.map((i) => i !== '-' && i.label), ['r', 's'])
})
