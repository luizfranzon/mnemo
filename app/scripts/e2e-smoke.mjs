// Fumaça ponta a ponta: abre o Electron com um repositório temporário, faz checkout pela ponte
// e Ctrl+Z na UI, e confere a branch mostrada na Aba. Uso: `bun run build && node scripts/e2e-smoke.mjs`
import { writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')
g('branch', 't34951')

const ui = await launch(repo, 9333)
const { ev, until, send } = ui
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
try {
  await until(branch, 'main')
  const p = repo.split(path.sep).join('/')
  await ev(`window.__mnemo.invoke('execute_operation', { path: '${p}', kind: { type: 'checkout', target: 't34951' } })`)
  await until(branch, 't34951')
  const undoTitle = await ev(`document.querySelector('.toolbar button')?.title`)
  assert.match(undoTitle, /Desfazer checkout de t34951/)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`)
  await until(branch, 'main')
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(os.tmpdir(), 'mnemo-shot.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('OK: abrir, checkout, Ctrl+Z')
} finally {
  ui.close()
}
process.exit(0)
