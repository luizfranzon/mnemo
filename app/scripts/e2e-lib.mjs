// Harness dos testes ponta a ponta: sobe o Electron com um repositório temporário e o controla pelo CDP.
import { execFileSync, spawn, spawnSync } from 'node:child_process'
import { mkdtempSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import assert from 'node:assert/strict'

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

export function makeRepo() {
  const repo = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-'))
  const g = (...a) => execFileSync('git', a, { cwd: repo, stdio: 'pipe' })
  g('init', '-q', '-b', 'main')
  g('config', 'user.name', 't')
  g('config', 'user.email', 't@e')
  return { repo, g }
}

/** `repo` pode ser vários caminhos ou nenhum; `userData` fixo permite reabrir o app e ver o que ele lembrou. */
export async function launch(repo, port, userData = mkdtempSync(path.join(os.tmpdir(), 'mnemo-e2e-data-'))) {
  const app = spawn('./node_modules/.bin/electron', ['.', `--remote-debugging-port=${port}`, `--user-data-dir=${userData}`, ...[repo ?? []].flat()], { stdio: 'ignore' })
  let target
  for (let i = 0; i < 40 && !target; i++) {
    await sleep(500)
    try {
      target = (await (await fetch(`http://127.0.0.1:${port}/json`)).json()).find((t) => t.type === 'page')
    } catch {}
  }
  assert.ok(target, 'janela do Electron não apareceu')
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
  await send('Runtime.enable')
  const ev = async (expr) => (await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true })).result.result.value
  const until = async (fn, want) => {
    for (let i = 0; i < 40; i++) {
      if ((await fn()) === want) return
      await sleep(250)
    }
    assert.equal(await fn(), want)
  }
  const click = (text) =>
    ev(`(() => { const b = [...document.querySelectorAll(document.querySelector('.modal') ? '.modal button' : 'button')].find((b) => b.textContent.trim().includes(${JSON.stringify(text)}) && !b.disabled); b?.click(); return !!b })()`)
  // mata a árvore inteira (no Windows `kill()` deixa os filhos do Electron abertos)
  const close = () => {
    if (process.platform === 'win32') spawnSync('taskkill', ['/pid', String(app.pid), '/T', '/F'])
    else app.kill()
  }
  // fecha pela janela, como o usuário: o localStorage só chega ao disco numa saída normal (kill /F perde a última escrita)
  const quit = async () => {
    const exited = new Promise((r) => app.once('exit', r))
    send('Browser.close')
    await Promise.race([exited, sleep(8000)])
    close()
  }
  return { send, ev, until, click, close, quit }
}
