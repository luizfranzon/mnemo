// Painel de refs pela UI real: filtro, rail, checkout remoto com tracking e Desfazer.
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'inicial')
const remote = mkdtempSync(path.join(os.tmpdir(), 'mnemo-remote-'))
execFileSync('git', ['init', '-q', '--bare', '-b', 'main', remote])
g('remote', 'add', 'origin', remote)
g('push', '-q', '-u', 'origin', 'main')
g('branch', 'feature/nova')
g('push', '-q', 'origin', 'feature/nova')
g('branch', '-D', 'feature/nova')
const ui = await launch(repo, 9339)
const { ev, until } = ui
try {
  await until(() => ev(`!!document.querySelector('.refs-row[title="origin/feature/nova"]')`), true)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'f',ctrlKey:true,altKey:true,bubbles:true}))`)
  await until(() => ev(`document.activeElement?.getAttribute('aria-label')`), 'Filtrar refs')
  await ev(`(() => { const i=document.querySelector('.refs-filter'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype,'value').set.call(i,'feature'); i.dispatchEvent(new Event('input',{bubbles:true})); return true })()`)
  await until(() => ev(`!!document.querySelector('.refs-row[title="origin/feature/nova"]')`), true)
  await until(() => ev(`!!document.querySelector('.refs-row[title="main"]')`), false)
  await ev(`document.querySelector('.refs-row[title="origin/feature/nova"]').dispatchEvent(new MouseEvent('dblclick',{bubbles:true}))`)
  await until(() => ev(`document.querySelector('[data-testid="current-branch"]')?.textContent`), 'feature/nova')
  assert.equal(g('rev-parse', '--abbrev-ref', '--symbolic-full-name', '@{upstream}').toString().trim(), 'origin/feature/nova')
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'z',ctrlKey:true,bubbles:true}))`)
  await until(() => ev(`document.querySelector('[data-testid="current-branch"]')?.textContent`), 'main')
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', {key:'j',ctrlKey:true,bubbles:true}))`)
  await until(() => ev(`!!document.querySelector('.refs-rail button[aria-label^="Remotos"]')`), true)
  console.log('OK: filtro, checkout remoto, Desfazer e rail')
} finally { ui.close() }
process.exit(0)
