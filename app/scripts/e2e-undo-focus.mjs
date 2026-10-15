// Ctrl+Z com foco em campo de texto não age na Operação (fica com o desfazer nativo do texto);
// fora do campo age. Uso: `bun run build && node scripts/e2e-undo-focus.mjs`
import assert from 'node:assert/strict'
import path from 'node:path'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')
g('branch', 't34951')

const ui = await launch(repo, 9334)
const { ev, until } = ui
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
const ctrlZ = (target) => ev(`${target}.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`)
try {
  await until(branch, 'main')
  const p = repo.split(path.sep).join('/')
  await ev(`window.__mnemo.invoke('execute_operation', { path: '${p}', kind: { type: 'checkout', target: 't34951' } })`)
  await until(branch, 't34951')
  // abre a paleta (Ctrl+P) para ter um campo de texto focado
  await ev(`document.querySelector('.branch-button').click()`)
  await until(() => ev(`document.activeElement?.tagName`), 'INPUT')
  await ctrlZ('document.activeElement')
  await sleep(1000)
  assert.equal(await branch(), 't34951', 'Ctrl+Z no campo não pode desfazer a Operação')
  await ev(`document.activeElement.blur()`)
  await ctrlZ('document.body')
  await until(branch, 'main')
  console.log('OK: Ctrl+Z em campo preserva a Operação; fora do campo desfaz')
} finally {
  ui.close()
}
process.exit(0)
