// Sem nada para commitar a linha WIP não aparece; ao criar um arquivo ela volta.
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'um')
g('commit', '-q', '--allow-empty', '-m', 'dois')
const ui = await launch(repo, 9365)
const { ev, until } = ui
try {
  await until(() => ev(`document.querySelectorAll('.graph-row').length`), 2)
  assert.equal(await ev(`!!document.querySelector('.graph-wip')`), false)
  assert.equal(await ev(`document.querySelector('.graph-row .graph-message').textContent`), 'dois')
  writeFileSync(path.join(repo, 'novo.txt'), 'x')
  await ev(`window.dispatchEvent(new Event('focus'))`)
  await until(() => ev(`!!document.querySelector('.graph-wip')`), true)
  await until(() => ev(`document.querySelectorAll('.graph-row').length`), 3)
  console.log('OK: linha WIP some sem mudanças e volta ao criar arquivo')
} finally { ui.close() }
process.exit(0)
