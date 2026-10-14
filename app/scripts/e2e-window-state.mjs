// A janela reabre maximizada se fechou maximizada, e com o tamanho em que foi fechada.
// Uso: `bun run build:electron && node scripts/e2e-window-state.mjs`
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo } = makeRepo()
const data = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-win-'))
const size = (ui) => ui.ev(`[window.outerWidth, window.outerHeight]`)
let ui = await launch(repo, 9347, data)
let first
try {
  await ui.ev(`window.__mnemo.invoke('window_action', { action: 'toggleMaximize' })`)
  first = await size(ui)
  await ui.until(async () => (await size(ui))[0] !== 1280, true)
  first = await size(ui)
} finally { await ui.quit() }
ui = await launch(repo, 9347, data)
try {
  assert.deepEqual(await size(ui), first, 'deve reabrir maximizada')
  console.log('OK: janela reabre maximizada')
} finally { ui.close() }
process.exit(0)
