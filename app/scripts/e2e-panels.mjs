// Casca do layout: arrastar divisor grava a largura ao soltar, arrastar até o mínimo recolhe, duplo clique
// volta ao padrão; StatusBar mostra as versões; fontes empacotadas carregam. Uso: `bun run build && node scripts/e2e-panels.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'x')

const ui = await launch(repo, 9338)
const { ev, until, send } = ui
const width = (sel) => ev(`Math.round(document.querySelector(${JSON.stringify(sel)})?.getBoundingClientRect().width ?? -1)`)
const divider = (side) => ev(`(() => { const r = document.querySelector('.panel-${side} .divider').getBoundingClientRect(); return [r.x + r.width / 2, r.y + 100] })()`)
const mouse = (type, x, y, clickCount = 1) => send('Input.dispatchMouseEvent', { type, x, y, button: 'left', buttons: type === 'mouseReleased' ? 0 : 1, clickCount })
async function drag(side, dx) {
  const [x, y] = await divider(side)
  await mouse('mousePressed', x, y)
  await mouse('mouseMoved', x + dx / 2, y)
  await mouse('mouseMoved', x + dx, y)
  await mouse('mouseReleased', x + dx, y)
}
try {
  await until(() => ev(`!!document.querySelector('[data-testid=current-branch]')`), true)
  assert.equal(await width('.panel-left'), 264)
  assert.equal(await width('.panel-right'), 380)

  await drag('left', 56)
  await until(() => width('.panel-left'), 320)
  assert.match(await ev(`Object.values(localStorage).join()`), /"left":320/)

  await drag('right', 500) // até o mínimo: recolhe
  await until(() => ev(`!!document.querySelector('.panel-right')`), false)

  await drag('left', -400) // vira rail
  await until(() => ev(`document.querySelector('.panel-left').classList.contains('rail')`), true)
  const [x, y] = await divider('left')
  await mouse('mousePressed', x, y, 1)
  await mouse('mouseReleased', x, y, 1)
  await mouse('mousePressed', x, y, 2)
  await mouse('mouseReleased', x, y, 2)
  await until(() => width('.panel-left'), 264)

  assert.match(await ev(`document.querySelector('.statusbar').textContent`), /git \d+\.\d+.*Mnemo \d+\.\d+\.\d+/)
  await ev(`document.fonts.ready`)
  assert.ok(await ev(`[...document.fonts].some((f) => f.family.includes('IBM Plex Sans') && f.status === 'loaded')`), 'IBM Plex Sans não carregou')
  console.log('OK: divisores, recolher, duplo clique, StatusBar e fontes')
} finally {
  ui.close()
}
process.exit(0)
