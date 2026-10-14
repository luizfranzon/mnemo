// Roda a roda horizontal (ou Shift+roda) sobre o grafo: só Branch/Tag + Grafo andam; Mensagem fica fixa.
// Uso: `bun run build:renderer && node scripts/e2e-graph-hscroll.mjs`
import assert from 'node:assert/strict'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'base')
for (let i = 0; i < 40; i++) { g('switch', '-q', '-c', `b${i}`, 'main'); g('commit', '-q', '--allow-empty', '-m', `t${i}`) }
const ui = await launch(repo, 9346)
try {
  await ui.until(() => ui.ev(`document.querySelectorAll('.graph-row').length > 5`), true)
  const x = () => ui.ev(`[document.querySelector('.graph-row .graph-canvas')?.getBoundingClientRect().x, document.querySelector('.graph-row .graph-message')?.getBoundingClientRect().x]`)
  const [c0, m0] = await x()
  await ui.send('Input.dispatchMouseEvent', { type: 'mouseWheel', x: 600, y: 300, deltaX: 120, deltaY: 0 })
  await sleep(300)
  const [c1, m1] = await x()
  assert.ok(c1 < c0, `grafo não andou: ${c0} -> ${c1}`)
  assert.equal(m1, m0, 'Mensagem deve ficar fixa')
  console.log('OK: rolagem horizontal move só Branch/Tag + Grafo')
} finally { ui.close() }
process.exit(0)
