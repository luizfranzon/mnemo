// Grafo real: linhas SVG, seleção, WIP, checkout pela pill e Desfazer.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'inicial')
const first = g('rev-parse', 'HEAD').toString().trim()
g('branch', 'old', first)
g('commit', '-q', '--allow-empty', '-m', 'segundo')
g('commit', '-q', '--allow-empty', '-m', 'terceiro')
writeFileSync(path.join(repo, 'novo.txt'), 'novo')
const ui = await launch(repo, 9340)
const { ev, until, send } = ui
try {
  await until(() => ev(`document.querySelectorAll('.graph-row').length`), 4)
  assert.equal(await ev(`document.querySelectorAll('.graph-row svg circle').length >= 4`), true)
  assert.match(await ev(`document.querySelector('.graph-row')?.textContent`), /WIP.*\+ 1/)
  await ev(`document.querySelector('.refs-row[title="old"]').click()`)
  await until(() => ev(`!!document.querySelector('.graph-row .graph-sha[title="${first}"]').parentElement.classList.contains('selected')`), true)
  await ev(`document.querySelector('.graph-row .graph-sha[title="${first}"]').parentElement.click()`)
  await until(() => ev(`!!document.querySelector('.graph-row .graph-sha[title="${first}"]').parentElement.classList.contains('selected')`), true)
  // duplo clique no commit não faz nada: o HEAD nunca fica destacado por ele
  await ev(`document.querySelector('.graph-row .graph-sha[title="${first}"]').parentElement.dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
  await new Promise((r) => setTimeout(r, 400))
  assert.equal(await ev(`document.querySelector('[data-testid="current-branch"]')?.textContent`), 'main')
  // duplo clique na pill faz checkout da branch
  await ev(`[...document.querySelectorAll('.graph-pill')].find((p) => p.textContent.includes('old')).dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
  await until(() => ev(`document.querySelector('[data-testid="current-branch"]')?.textContent`), 'old')
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'z',ctrlKey:true,bubbles:true}))`)
  await until(() => ev(`document.querySelector('[data-testid="current-branch"]')?.textContent`), 'main')
  await until(() => ev(`document.querySelectorAll('.graph-row').length === 4 && !document.querySelector('.graph-loading')`), true)
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(os.tmpdir(), 'mnemo-graph-shot.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('OK: grafo, WIP, checkout pela pill e Desfazer')
} finally { ui.close() }
process.exit(0)
