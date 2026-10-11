// index.lock de outro processo vira erro claro com "Tentar de novo"; removido o lock, o botão refaz a ação.
// Uso: `bun run build && node scripts/e2e-index-lock.mjs`
import assert from 'node:assert/strict'
import { rmSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')
g('branch', 't34951')

const ui = await launch(repo, 9335)
const { ev, until, click } = ui
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
const banner = () => ev(`document.querySelector('[role=alert]')?.textContent ?? ''`)
try {
  await until(branch, 'main')
  const lock = path.join(repo, '.git', 'index.lock')
  writeFileSync(lock, '')
  // dispara pela UI: Buscar passa por actions.execute e deve parar no lock
  await click('Buscar')
  await until(async () => (await banner()).includes('Outro processo git está usando este repositório'), true)
  assert.ok(await click('Tentar de novo'), 'botão Tentar de novo ausente')
  assert.ok((await banner()).includes('Outro processo git'), 'com o lock ainda presente o erro continua')
  rmSync(lock)
  await click('Tentar de novo')
  await until(async () => !(await banner()).includes('Outro processo git'), true)
  console.log('OK: index.lock mostra o erro e Tentar de novo refaz após remover o lock')
} finally {
  ui.close()
}
process.exit(0)
