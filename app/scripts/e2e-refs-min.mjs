// A coluna Branch / Tag nunca fica menor que a maior pill: arrastar o divisor para a esquerda para no tamanho dela.
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'a')
g('branch', 'feature/uma-branch-com-nome-bem-longo')
g('commit', '-q', '--allow-empty', '-m', 'b')
const ui = await launch(repo, 9364)
const { ev, until, send } = ui
try {
  await until(() => ev(`document.querySelectorAll('.graph-pill').length >= 2`), true)
  const widest = () => ev(`Math.max(...[...document.querySelectorAll('.graph-pill:not(.graph-ghost)')].map((p) => p.getBoundingClientRect().width))`)
  const refsWidth = () => ev(`document.querySelector('.graph-header .graph-hcell').getBoundingClientRect().width`)
  const handle = JSON.parse(await ev(`(() => { const r = document.querySelector('.graph-header .col-handle').getBoundingClientRect(); return JSON.stringify([r.x + r.width / 2, r.y + r.height / 2]) })()`))
  const [x, y] = handle
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', buttons: 1, clickCount: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: x - 400, y, button: 'left', buttons: 1 })
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: x - 400, y, button: 'left', buttons: 0, clickCount: 1 })
  await new Promise((r) => setTimeout(r, 300))
  const [w, pill] = [await refsWidth(), await widest()]
  assert.ok(w >= pill + 13, `coluna ${w}px menor que a pill ${pill}px`)
  assert.ok(w < pill + 13 + 30, `coluna ${w}px bem maior que o mínimo ${pill + 13}px`)
  console.log('OK: mínimo da Branch / Tag = maior pill')
} finally { ui.close() }
process.exit(0)
