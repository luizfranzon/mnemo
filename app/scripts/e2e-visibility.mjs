// Visibilidade no grafo: olho no hover, Solo e Fixar pelo menu, busca por mensagem (Ctrl+F), estado salvo.
// Uso: `bun run build && node scripts/e2e-visibility.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'inicial')
g('checkout', '-q', '-b', 'feat')
g('commit', '-q', '--allow-empty', '-m', 'da feat')
g('checkout', '-q', 'main')
g('commit', '-q', '--allow-empty', '-m', 'da main')

const ui = await launch(repo, 9341)
const { ev, until, click } = ui
const row = (title) => `.refs-row[title="${title}"]`
const rows = () => ev(`document.querySelectorAll('.graph-row').length`)
const subjects = () => ev(`[...document.querySelectorAll('.graph-row .graph-message')].map((s) => s.textContent)`)
const rightClick = (title) => ev(`document.querySelector('${row(title)}').parentElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 200 }))`)
try {
  await until(() => ev(`!!document.querySelector('${row('feat')}')`), true)
  await until(rows, 4) // WIP + 3 commits
  await ev(`document.querySelector('${row('feat')}').parentElement.querySelector('.refs-eye').click()`)
  await until(rows, 3)
  assert.ok(!(await subjects()).includes('da feat'))
  await ev(`document.querySelector('${row('feat')}').parentElement.querySelector('.refs-eye').click()`)
  await until(rows, 4)

  await rightClick('feat')
  await until(() => click('Solo'), true)
  await until(rows, 3) // WIP + da feat + inicial
  assert.ok(!(await subjects()).includes('da main'))
  await ev(`document.querySelector('.graph-chip').click()`)
  await until(rows, 4)

  await rightClick('feat')
  await until(() => click('Fixar à esquerda'), true)
  await until(() => ev(`[...document.querySelectorAll('.refs-label')].some((l) => l.textContent === 'Fixadas')`), true)

  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))`)
  await until(() => ev(`!!document.querySelector('.graph-filter input')`), true)
  await ev(`(() => { const i = document.querySelector('.graph-filter input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, 'feat'); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await until(() => ev(`document.querySelectorAll('.graph-row.dim').length`), 2)
  console.log('OK: visibilidade (ocultar, solo, fixar, busca)')
} finally {
  ui.close()
}
process.exit(0)
