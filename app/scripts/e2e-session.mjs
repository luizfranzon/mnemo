// Abas abertas voltam ao reabrir o app; pasta que sumiu fica de fora; aba fechada não volta.
// Uso: `bun run build && node scripts/e2e-session.mjs`
import assert from 'node:assert/strict'
import { mkdtempSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const a = makeRepo()
const b = makeRepo()
const c = makeRepo()
for (const r of [a, b, c]) r.g('commit', '-q', '--allow-empty', '-m', 'x')
const data = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-session-'))
const tabs = (ui) => ui.ev(`[...document.querySelectorAll('.tab-label')].map((t) => t.title)`)
const norm = (list) => list.map((p) => p.split(path.sep).join('/').toLowerCase()).sort()

let ui = await launch([a.repo, b.repo, c.repo], 9341, data)
try {
  await ui.until(async () => (await tabs(ui)).length, 3)
  await ui.ev(`document.querySelector('.tab-close[aria-label$="${path.basename(c.repo)}"]').click()`) // fecha C: não deve voltar
  await ui.until(async () => (await tabs(ui)).length, 2)
  await sleep(300)
} finally { await ui.quit() }
rmSync(b.repo, { recursive: true, force: true }) // B some do disco

ui = await launch(null, 9341, data)
try {
  await ui.until(async () => (await tabs(ui)).length, 1)
  assert.deepEqual(norm(await tabs(ui)), norm([a.repo]))
  console.log('OK: abas abertas voltam, pasta apagada e aba fechada ficam de fora')
} finally { ui.close() }
process.exit(0)
