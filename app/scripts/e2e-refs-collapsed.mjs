// Seções e pastas recolhidas no painel de refs voltam como estavam ao reabrir o app.
// Uso: `bun run build && node scripts/e2e-refs-collapsed.mjs`
import assert from 'node:assert/strict'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')
g('tag', 'v1')
const data = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-refs-collapsed-'))
const expanded = (ui, title) => ui.ev(`document.querySelector('.refs-section[title=${JSON.stringify(title)}]')?.getAttribute('aria-expanded')`)

let ui = await launch(repo, 9342, data)
try {
  await ui.until(() => expanded(ui, 'Local'), 'true')
  await ui.ev(`document.querySelector('.refs-section[title="Local"]').click()`)
  await ui.until(() => expanded(ui, 'Local'), 'false')
  await sleep(300)
} finally { await ui.quit() }

ui = await launch(null, 9342, data)
try {
  await ui.until(() => expanded(ui, 'Local'), 'false')
  assert.equal(await expanded(ui, 'Tags'), 'true')
  console.log('OK: seção recolhida continua recolhida ao reabrir')
} finally { ui.close() }
process.exit(0)
