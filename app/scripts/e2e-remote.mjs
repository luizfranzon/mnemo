// Push de branch sem upstream define o upstream; Excluir remota pede confirmação e não é desfazível.
// Uso: `bun run build && node scripts/e2e-remote.mjs`
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const bare = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-bare-'))
execFileSync('git', ['init', '-q', '--bare', '-b', 'main'], { cwd: bare })
g('commit', '-q', '--allow-empty', '-m', 'x')
g('remote', 'add', 'origin', bare)
g('push', '-q', '-u', 'origin', 'main')
g('checkout', '-q', '-b', 'nova')
const remoteBranches = () => execFileSync('git', ['branch', '--list'], { cwd: bare }).toString()

const ui = await launch(repo, 9336)
const { ev, until, click } = ui
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
const undoTitle = () => ev(`[...document.querySelectorAll('button')].find((b) => b.textContent.includes('Desfazer'))?.title ?? ''`)
try {
  await until(branch, 'nova')
  await click('Push')
  await until(() => remoteBranches().includes('nova'), true)
  assert.equal(g('rev-parse', '--abbrev-ref', 'nova@{upstream}').toString().trim(), 'origin/nova')

  await click('Excluir remota…')
  await until(() => ev(`[...document.querySelectorAll('.palette-row')].some((b) => b.textContent.includes('origin/nova'))`), true)
  await ev(`[...document.querySelectorAll('.palette-row')].find((b) => b.textContent.includes('origin/nova')).click()`)
  await until(() => ev(`document.querySelector('.modal h2')?.textContent ?? ''`), 'Excluir origin/nova?')
  assert.ok(await click('Excluir do remoto'), 'botão de confirmar ausente')
  await until(() => remoteBranches().includes('nova'), false)
  await until(async () => (await undoTitle()).includes('mexe no remoto'), true)
  console.log('OK: Push define o upstream e Excluir remota confirma, apaga e não é desfazível')
} finally {
  ui.close()
}
process.exit(0)
