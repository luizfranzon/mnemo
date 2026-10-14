// Merge parado em conflito no Mnemo e concluído fora: ao voltar o foco, o banner some e o merge entra no Histórico.
// Uso: `bun run build && node scripts/e2e-external-merge.mjs`
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const file = (text) => writeFileSync(path.join(repo, 'a.txt'), text)
file('base\n'); g('add', '.'); g('commit', '-q', '-m', 'base')
g('checkout', '-q', '-b', 'feat'); file('FEAT\n'); g('commit', '-qam', 'feat')
g('checkout', '-q', 'main'); file('MAIN\n'); g('commit', '-qam', 'main')

const ui = await launch(repo, 9343)
const { ev, until } = ui
const focus = () => ev(`window.dispatchEvent(new Event('focus'))`)
const banner = () => ev(`!!document.querySelector('.progress-banner')`)
try {
  await until(() => ev(`!!document.querySelector('[data-testid=current-branch]')`), true)
  const p = JSON.stringify(repo)
  await ev(`window.__mnemo.invoke('execute_operation', { path: ${p}, kind: { type: 'merge', target: 'feat' } })`)
  await focus()
  await until(banner, true)

  file('resolvido\n'); g('add', 'a.txt'); g('commit', '-q', '--no-edit') // "no VS Code"
  await focus()
  await until(banner, false)
  await until(() => ev(`[...document.querySelectorAll('button')].some((b) => /Desfazer merge de feat/.test(b.title) && !b.disabled)`), true)
  console.log('OK: merge concluído fora some do banner e entra no Histórico ao voltar o foco')
} finally { ui.close() }
process.exit(0)
