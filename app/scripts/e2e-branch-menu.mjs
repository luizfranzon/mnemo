// Menu de contexto da branch no painel de refs: cabeçalho, rótulos com nomes, merge, renomear, excluir local+remota.
// Uso: `bun run build && node scripts/e2e-branch-menu.mjs`
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'inicial')
const bare = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-bare-'))
execFileSync('git', ['init', '-q', '--bare', '-b', 'main'], { cwd: bare })
g('remote', 'add', 'origin', bare)
g('push', '-q', '-u', 'origin', 'main')
g('checkout', '-q', '-b', 'feat')
g('commit', '-q', '--allow-empty', '-m', 'da feat')
g('push', '-q', '-u', 'origin', 'feat')
g('checkout', '-q', 'main')
const remoteBranches = () => execFileSync('git', ['branch', '--list'], { cwd: bare }).toString()
const localBranches = () => g('branch', '--list').toString()

const ui = await launch(repo, 9340)
const { ev, until, click } = ui
const row = (title) => `.refs-row[title="${title}"]`
const rightClick = (title) => ev(`document.querySelector('${row(title)}').parentElement.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 60, clientY: 200 }))`)
const items = () => ev(`[...document.querySelectorAll('.menu-label, .toolbar-menu-heading')].map((s) => s.textContent)`)
const typeInto = (sel, value) => ev(`(() => { const i = document.querySelector('${sel}'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(value)}); i.dispatchEvent(new Event('input', { bubbles: true })); return true })()`)
try {
  await until(() => ev(`!!document.querySelector('${row('feat')}')`), true)
  await rightClick('feat')
  await until(async () => (await items()).includes('Merge feat em main'), true)
  const labels = await items()
  assert.ok(labels.includes('feat · ↑0 ↓0 · rastreia origin/feat'), labels.join(' | '))
  assert.ok(labels.includes('Rebase main sobre feat') && labels.includes('Excluir feat…') && labels.includes('Pull feat'))

  assert.ok(await click('Merge feat em main'))
  await until(() => g('log', '-1', '--format=%s').toString().trim(), 'da feat')

  await rightClick('feat')
  await until(() => click('Renomear…'), true)
  await until(() => ev(`!!document.querySelector('dialog #branch-new-name')`), true)
  await typeInto('#branch-new-name', 'feat2')
  assert.ok(await click('Renomear'))
  await until(() => localBranches().includes('feat2'), true)

  await until(() => ev(`!!document.querySelector('${row('feat2')}')`), true)
  await rightClick('feat2')
  await until(() => click('Excluir feat2…'), true)
  await until(() => ev(`document.querySelector('dialog h2')?.textContent ?? ''`), 'Excluir branch')
  await ev(`document.querySelectorAll('dialog input[type=checkbox]')[1].click()`) // marca também a remota (origin/feat)
  await until(() => ev(`!!document.querySelector('dialog .warning')`), true)
  assert.ok(await click('Excluir'))
  await until(() => localBranches().includes('feat2'), false)
  await until(() => remoteBranches().includes('feat'), false)
  console.log('OK: menu da branch (cabeçalho, merge, renomear, excluir local e remota)')
} finally {
  ui.close()
}
process.exit(0)
