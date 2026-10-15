// Instrumentação da abertura, ligada só com MNEMO_BENCH (usada por scripts/bench-startup.mjs).
// Tudo sai no stdout como `[bench] {json}`, com tempos em epoch ms (mesmo relógio do script que lançou o app).
import type { BrowserWindow } from 'electron'
import { writeFileSync } from 'node:fs'

export const benchOn = !!process.env.MNEMO_BENCH
export const now = () => performance.timeOrigin + performance.now()

export function mark(label: string, t = now(), ms?: number) {
  if (benchOn) console.log(`[bench] ${JSON.stringify({ label, t, ms })}`)
}

// Roda na página antes de qualquer script dela: anota long tasks e, quando a 1ª linha do grafo entra
// no DOM, manda os tempos do renderer (navegação, paint) pelo console.
const PAGE = `(() => {
  const long = []
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) long.push({ start: e.startTime, ms: e.duration }) }).observe({ type: 'longtask' }) } catch {}
  let graph = 0
  const send = (frame) => {
    const nav = performance.getEntriesByType('navigation')[0]?.toJSON() ?? {}
    const paint = performance.getEntriesByType('paint').map((e) => ({ name: e.name, t: e.startTime }))
    console.debug('[bench:renderer]' + JSON.stringify({ origin: performance.timeOrigin, nav, paint, long, graph, frame }))
  }
  const check = () => {
    if (graph || !document.querySelector('.graph-row')) return
    graph = performance.now()
    obs.disconnect()
    requestAnimationFrame(() => setTimeout(() => send(performance.now())))
  }
  const obs = new MutationObserver(check)
  document.addEventListener('DOMContentLoaded', () => { obs.observe(document.body, { childList: true, subtree: true }); check() })
})()`

/** Antes do 1º load: injeta o script da página e, com MNEMO_BENCH_PROFILE=<arquivo>, grava o .cpuprofile do renderer até o grafo aparecer. */
export async function benchWindow(win: BrowserWindow) {
  if (!benchOn) return
  const profile = process.env.MNEMO_BENCH_PROFILE
  const dbg = win.webContents.debugger
  dbg.attach('1.3')
  dbg.on('message', (_e, method, params: { args?: { value?: unknown }[] }) => {
    const text = params.args?.[0]?.value
    if (method !== 'Runtime.consoleAPICalled' || typeof text !== 'string' || !text.startsWith('[bench:renderer]')) return
    console.log(`[bench] ${JSON.stringify({ label: 'renderer', t: now(), data: JSON.parse(text.slice(16)) })}`)
    void (async () => {
      if (profile) writeFileSync(profile, JSON.stringify((await dbg.sendCommand('Profiler.stop')).profile))
      mark('fim')
    })()
  })
  // antes do 1º load não há renderer e os comandos do CDP não respondem: abre about:blank primeiro
  await win.loadURL('about:blank')
  await dbg.sendCommand('Runtime.enable')
  await dbg.sendCommand('Page.enable')
  await dbg.sendCommand('Page.addScriptToEvaluateOnNewDocument', { source: PAGE })
  if (profile) {
    await dbg.sendCommand('Profiler.enable')
    await dbg.sendCommand('Profiler.setSamplingInterval', { interval: 200 })
    await dbg.sendCommand('Profiler.start')
  }
}
