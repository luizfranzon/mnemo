// Fumaça ponta a ponta: abre o Electron com um repositório temporário, faz checkout pela ponte
// e Ctrl+Z na UI, e confere a branch mostrada na Aba. Uso: `bun run build && node scripts/e2e-smoke.mjs`
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

const repo = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-'))
const g = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' })
g('init', '-q', '-b', 'main')
g('config', 'user.name', 't')
g('config', 'user.email', 't@e')
g('commit', '-q', '--allow-empty', '-m', 'x')
g('branch', 't34951')

const app = spawn('./node_modules/.bin/electron', ['.', '--remote-debugging-port=9333', repo], { stdio: 'ignore' })
const sleep = (ms) => new Promise((r) => setTimeout(r, ms))
let target
for (let i = 0; i < 40 && !target; i++) {
  await sleep(500)
  try {
    target = (await (await fetch('http://127.0.0.1:9333/json')).json()).find((t) => t.type === 'page')
  } catch {}
}
const ws = new WebSocket(target.webSocketDebuggerUrl)
await new Promise((r) => (ws.onopen = r))
let id = 0
const pending = new Map()
ws.onmessage = (m) => {
  const d = JSON.parse(m.data)
  if (d.method === 'Runtime.exceptionThrown') console.error('Exceção na UI:', d.params.exceptionDetails.exception?.description ?? d.params.exceptionDetails.text)
  if (d.method === 'Runtime.consoleAPICalled' && d.params.type === 'error') console.error('console.error:', d.params.args.map((a) => a.value ?? a.description).join(' '))
  pending.get(d.id)?.(d)
}
const send = (method, params = {}) =>
  new Promise((r) => {
    const i = ++id
    pending.set(i, r)
    ws.send(JSON.stringify({ id: i, method, params }))
  })
const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value
const branch = () => ev(`document.querySelector('[data-testid=current-branch]')?.textContent`)
const until = async (fn, want) => {
  for (let i = 0; i < 40; i++) {
    if ((await fn()) === want) return
    await sleep(250)
  }
  assert.equal(await fn(), want)
}

await send('Runtime.enable')
try {
  await until(branch, 'main')
  const p = repo.split(path.sep).join('/')
  await ev(`window.__mnemo.invoke('execute_operation', { path: '${p}', kind: { type: 'checkout', target: 't34951' } })`)
  await until(branch, 't34951')
  const undoTitle = await ev(`document.querySelector('.toolbar button')?.title`)
  assert.match(undoTitle, /Desfazer checkout de t34951/)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }))`)
  await until(branch, 'main')
  const shot = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(os.tmpdir(), 'mnemo-shot.png'), Buffer.from(shot.result.data, 'base64'))
  console.log('OK: abrir, checkout, Ctrl+Z')
} finally {
  // mata a árvore inteira (no Windows `kill()` deixa os filhos do Electron abertos)
  if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
  else app.kill()
}
process.exit(0)
