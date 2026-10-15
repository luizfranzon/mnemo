// Ctrl+F pela UI real: overlay com contagem de ocorrências e navegação entre elas.
// Uso: `bun run build && node scripts/e2e-find.mjs`
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
for (const m of ['fix a', 'outro', 'fix b', 'fix c']) g('commit', '-q', '--allow-empty', '-m', m)
// a linha WIP só aparece com algo para commitar
;(await import('node:fs')).writeFileSync(`${repo}/wip.txt`, 'x')
const ui = await launch(repo, 9355)
const { ev, until, send } = ui
const count = () => ev(`document.querySelector('.graph-filter-count')?.textContent`)
const selected = () => ev(`document.querySelector('.graph-row.selected .graph-message')?.textContent`)
const type = (text) => ev(`(() => { const i = document.querySelector('.graph-filter input'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(i, ${JSON.stringify(text)}); i.dispatchEvent(new Event('input', { bubbles: true })) })()`)
const key = (k, shiftKey = false) => ev(`document.querySelector('.graph-filter input').dispatchEvent(new KeyboardEvent('keydown', { key: ${JSON.stringify(k)}, shiftKey: ${shiftKey}, bubbles: true }))`)
try {
  await until(() => ev(`document.querySelectorAll('.graph-row').length`), 5)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'f', ctrlKey: true, bubbles: true }))`)
  await until(() => ev(`document.activeElement?.getAttribute('aria-label')`), 'Buscar na mensagem')
  await type('fix')
  await until(count, '1/3')
  assert.equal(await selected(), 'fix c')
  await key('Enter')
  await until(count, '2/3')
  assert.equal(await selected(), 'fix b')
  await ev(`document.querySelector('button[aria-label="Próxima ocorrência"]').click()`)
  await until(count, '3/3')
  await key('Enter')
  await until(count, '1/3') // dá a volta
  await key('Enter', true)
  await until(count, '3/3')
  assert.equal(await ev(`document.querySelectorAll('.graph-row.dim').length`), 1)
  const shot = await send('Page.captureScreenshot')
  writeFileSync(process.env.SHOT ?? '/dev/null', Buffer.from(shot.result.data, 'base64'))
  await key('Escape')
  await until(() => ev(`document.querySelector('.graph-filter') === null`), true)
  console.log('OK: busca com contagem e navegação')
} finally { ui.close() }
process.exit(0)
