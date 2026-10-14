// Filtro da coluna Autor pela UI real: lista de todos os autores, seleção múltipla e esmaecimento das linhas.
// Uso: `bun run build && node scripts/e2e-author-filter.mjs`
import assert from 'node:assert/strict'
import { writeFileSync } from 'node:fs'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const as = (name, email, msg) => g('-c', `user.name=${name}`, '-c', `user.email=${email}`, 'commit', '-q', '--allow-empty', '-m', msg)
as('Ana Lima', 'ana@x.com', 'a1')
as('Bruno Melo', 'bruno@x.com', 'b1')
as('Ana Lima', 'ANA@x.com', 'a2')
const ui = await launch(repo, 9353)
const { ev, until, send } = ui
const dimmed = () => ev(`document.querySelectorAll('.graph-row.dim').length`)
try {
  await until(() => ev(`document.querySelectorAll('.graph-row').length`), 4)
  await ev(`document.querySelector('button[aria-label="Filtrar por autor"]').click()`)
  await until(() => ev(`document.querySelectorAll('.author-row').length`), 2)
  assert.equal(await ev(`document.activeElement?.getAttribute('aria-label')`), 'Buscar autor')
  await ev(`[...document.querySelectorAll('.author-row')].find((r) => r.textContent.includes('Ana Lima')).click()`)
  await until(dimmed, 1)
  assert.equal(await ev(`document.querySelectorAll('.author-row .avatar.checked').length`), 1)
  assert.equal(await ev(`document.querySelector('.author-filter') !== null`), true) // clicar não fecha
  await ev(`[...document.querySelectorAll('.author-row')].find((r) => r.textContent.includes('Bruno')).click()`)
  await until(dimmed, 0)
  const shot = await send('Page.captureScreenshot')
  writeFileSync(process.env.SHOT ?? '/dev/null', Buffer.from(shot.result.data, 'base64'))
  await ev(`[...document.querySelectorAll('.author-row')].find((r) => r.textContent.includes('Bruno')).click()`)
  await ev(`document.querySelector('.author-filter').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))`)
  await until(() => ev(`document.querySelector('.author-filter') === null`), true)
  assert.equal(await dimmed(), 1) // filtro continua com o overlay fechado
  assert.equal(await ev(`document.querySelector('button[aria-label="Filtrar por autor"]').classList.contains('active')`), true)
  console.log('OK: lista de autores, seleção múltipla e filtro ativo')
} finally { ui.close() }
process.exit(0)
