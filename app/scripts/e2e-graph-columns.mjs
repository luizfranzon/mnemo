// Colunas do grafo: arrastar divisor, duplo clique, engrenagem (ocultar, reordenar, compacto) e persistência por repositório.
// Uso: `bun run build && node scripts/e2e-graph-columns.mjs`
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'assunto', '-m', 'descrição do commit')
const data = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-cols-'))
const cols = (ui) => ui.ev(`getComputedStyle(document.querySelector('.graph-header')).gridTemplateColumns.split(' ').map(parseFloat)`)
const headers = (ui) => ui.ev(`[...document.querySelectorAll('.graph-hcell > span, .graph-hcell > .graph-scrollbar > span')].map((s) => s.textContent)`)
const at = (ui, sel) => ui.ev(`(() => { const r = document.querySelector(${JSON.stringify(sel)}).getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2] })()`)
const mouse = (ui, type, x, y, buttons) => ui.send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons, clickCount: type === 'mousePressed' ? 1 : 0 })
const gear = (ui) => ui.ev(`document.querySelector('.graph-gear').click()`)
const check = (ui, label) => ui.ev(`[...document.querySelectorAll('.graph-pop label')].find((l) => l.textContent.includes(${JSON.stringify(label)})).querySelector('input').click()`)

// a linha WIP só aparece com algo para commitar
;(await import('node:fs')).writeFileSync(`${repo}/wip.txt`, 'x')
let ui = await launch(repo, 9342, data)
try {
  await ui.until(() => ui.ev(`document.querySelectorAll('.graph-row').length > 1`), true)
  for (const k of ['j', 'k']) await ui.ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: '${k}', ctrlKey: true, bubbles: true }))`) // recolhe os painéis: o centro ocupa a janela
  await sleep(300)
  assert.deepEqual(await headers(ui), ['Branch / Tag', 'Grafo', 'Mensagem', 'Autor', 'Data', 'SHA'])
  const before = await cols(ui)

  // Autor fica depois da Mensagem: arrastar o divisor para a esquerda alarga a coluna
  const [x, y] = await at(ui, '.col-handle[aria-label="Redimensionar Autor"]')
  await mouse(ui, 'mousePressed', x, y, 1)
  await mouse(ui, 'mouseMoved', x - 40, y, 1)
  await mouse(ui, 'mouseMoved', x - 60, y, 1)
  await mouse(ui, 'mouseReleased', x - 60, y, 0)
  await ui.until(async () => Math.round((await cols(ui))[3] - before[3]), 60)
  assert.ok((await cols(ui))[2] >= 200, 'Mensagem nunca abaixo de 200px')

  // duplo clique ajusta ao conteúdo ("t" é um autor curto)
  const [hx, hy] = await at(ui, '.col-handle[aria-label="Redimensionar Autor"]')
  await ui.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hx, y: hy, button: 'left', buttons: 1, clickCount: 2 })
  await ui.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hx, y: hy, button: 'left', buttons: 0, clickCount: 2 })
  await ui.until(async () => (await cols(ui))[3] < before[3], true)

  // engrenagem: Descrição, compacto, ordem
  await gear(ui)
  await check(ui, 'Descrição')
  await check(ui, 'Layout compacto')
  await ui.until(async () => (await headers(ui)).includes('Descrição'), true)
  await ui.until(() => ui.ev(`document.querySelectorAll('.avatar.small').length > 0`), true)
  assert.ok(await ui.ev(`[...document.querySelectorAll('.graph-description')].some((s) => s.textContent === 'descrição do commit')`))
  await ui.ev(`document.querySelector('.graph-pop button[aria-label="Subir Grafo"]').click()`)
  await ui.until(async () => (await headers(ui))[0], 'Grafo')
  assert.equal(await ui.ev(`document.querySelector('.graph-pop input[type=checkbox]:disabled') !== null`), true, 'Grafo e Mensagem não podem ser ocultados')
  await sleep(300)
} finally { await ui.quit() }

ui = await launch(repo, 9342, data)
try {
  await ui.until(() => ui.ev(`document.querySelectorAll('.graph-row').length > 1`), true)
  const names = await headers(ui)
  assert.deepEqual(names.slice(0, 3), ['Grafo', 'Branch / Tag', 'Mensagem'])
  assert.ok(names.includes('Descrição'))
  assert.ok(await ui.ev(`document.querySelectorAll('.avatar.small').length > 0`))
  await gear(ui)
  await ui.ev(`document.querySelector('.graph-pop-reset').click()`)
  await ui.until(async () => (await headers(ui)).join(), 'Branch / Tag,Grafo,Mensagem,Autor,Data,SHA')
  console.log('OK: colunas (arrastar, ajustar, ocultar, reordenar, compacto, salvar e restaurar)')
} finally { ui.close() }
process.exit(0)
