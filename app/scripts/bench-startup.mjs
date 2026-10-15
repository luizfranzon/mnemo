// Benchmark da abertura: lança o app N vezes num repositório e segmenta o tempo até a 1ª linha do grafo
// (main, core, renderer, cada IPC e cada comando git). Com --profile grava o .cpuprofile do renderer e
// soma o tempo de CPU por lib/arquivo (precisa de sourcemap: `bunx vite build --sourcemap`).
// Uso: `bun run build && node scripts/bench-startup.mjs [repo] [--runs 5] [--profile]`  (repo padrão: este)
import { spawn } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

const argv = process.argv.slice(2)
const opt = (name, def) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : def)
const runs = Number(opt('--runs', 5))
const profiling = argv.includes('--profile')
const repo = path.resolve(argv.find((a, i) => !a.startsWith('--') && argv[i - 1] !== '--runs') ?? '..')
if (!existsSync('dist/index.html') || !existsSync('dist-electron/main.cjs')) throw new Error('rode `bun run build` antes')

const median = (xs) => [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)]
const fmt = (ms) => `${ms.toFixed(0).padStart(6)} ms`

/** Uma abertura: devolve as marcas `[bench]` em ms desde o spawn, mais o diretório de dados (logs do core). */
function launchOnce(profileFile) {
  const userData = mkdtempSync(path.join(os.tmpdir(), 'mnemo-bench-'))
  const env = { ...process.env, MNEMO_BENCH: '1', ...(profileFile && { MNEMO_BENCH_PROFILE: profileFile }) }
  const t0 = Date.now()
  const app = spawn('./node_modules/.bin/electron', ['.', `--user-data-dir=${userData}`, repo], { env, stdio: ['ignore', 'pipe', 'inherit'] })
  const marks = []
  let buf = ''
  return new Promise((done, fail) => {
    const timer = setTimeout(() => { app.kill(); fail(new Error('a 1ª linha do grafo não apareceu em 30s')) }, 30_000)
    app.stdout.on('data', (d) => {
      buf += d
      let nl
      while ((nl = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, nl)
        buf = buf.slice(nl + 1)
        if (!line.startsWith('[bench] ')) continue
        const m = JSON.parse(line.slice(8))
        marks.push({ ...m, t: m.t - t0 })
        if (m.label === 'fim') {
          clearTimeout(timer)
          app.once('exit', () => done({ marks, userData, t0 }))
          app.kill()
        }
      }
    })
  })
}

/** Linha do tempo de uma abertura: [rótulo, ms desde o spawn]. */
function timeline({ marks, t0 }) {
  const rows = marks.filter((m) => !m.label.startsWith('ipc ') && m.label !== 'renderer' && m.label !== 'fim').map((m) => [m.label, m.t])
  const r = marks.find((m) => m.label === 'renderer').data
  const at = (ms) => r.origin + ms - t0
  const n = r.nav
  rows.push(
    ['renderer: navegação começou', at(0)],
    ['renderer: HTML recebido', at(n.responseEnd)],
    ['renderer: DOM interativo (JS do bundle rodou)', at(n.domInteractive)],
    ['renderer: DOMContentLoaded fim', at(n.domContentLoadedEventEnd)],
    ['renderer: load fim (fontes/CSS)', at(n.loadEventEnd)],
    ...r.paint.map((p) => [`renderer: ${p.name}`, at(p.t)]),
    ['renderer: 1ª linha do grafo no DOM', at(r.graph)],
    ['renderer: frame com o grafo pintado', at(r.frame)],
  )
  return rows.sort((a, b) => a[1] - b[1])
}

const results = []
const profileFile = profiling && path.join(os.tmpdir(), `mnemo-startup-${Date.now()}.cpuprofile`)
for (let i = 0; i < runs; i++) {
  results.push(await launchOnce())
  process.stdout.write(`abertura ${i + 1}/${runs}\r`)
}
// o profiler deixa a abertura mais lenta: roda à parte, fora da mediana
if (profileFile) rmSync((await launchOnce(profileFile)).userData, { recursive: true, force: true })
console.log(`\nRepositório: ${repo}  ·  ${runs} aberturas (a 1ª costuma ser fria; mediana abaixo)\n`)

// --- Linha do tempo (mediana por marca)
const byLabel = new Map()
for (const r of results) for (const [label, t] of timeline(r)) byLabel.set(label, [...(byLabel.get(label) ?? []), t])
const rows = [...byLabel].map(([label, ts]) => [label, median(ts)]).sort((a, b) => a[1] - b[1])
console.log('Linha do tempo (ms desde o spawn do processo)        total     Δ anterior')
let prev = 0
for (const [label, t] of rows) {
  console.log(`  ${label.padEnd(48)} ${fmt(t)}  ${fmt(t - prev)}`)
  prev = t
}
console.log(`  primeira abertura (fria): ${fmt(timeline(results[0]).at(-1)[1])}`)
// sem o boot do Electron, que varia muito entre aberturas e esconde mudanças no app
const app = (x) => { const d = x.marks.find((m) => m.label === 'renderer').data; return d.frame - d.nav.domContentLoadedEventEnd }
console.log(`  DOMContentLoaded → grafo pintado (mediana): ${fmt(median(results.map(app)))}`)

// --- Última abertura em detalhe
const last = results.at(-1)
const r = last.marks.find((m) => m.label === 'renderer').data
console.log('\nIPC (última abertura): início desde o spawn, duração no main (core + git + JSON)')
for (const m of last.marks.filter((m) => m.label.startsWith('ipc ')).sort((a, b) => a.t - b.t)) console.log(`  ${m.label.slice(4).padEnd(30)} ${fmt(m.t)}  ${fmt(m.ms)}`)

console.log('\nComandos git (última abertura, log do core), mais lentos primeiro')
const logs = path.join(last.userData, 'logs')
const git = (existsSync(logs) ? readdirSync(logs) : []).flatMap((f) => readFileSync(path.join(logs, f), 'utf8').split('\n'))
  .map((l) => l.match(/^\[[\d:]+\] (git .*) → código (-?\d+) \((\d+)ms\)/)).filter(Boolean)
  .map(([, cmd, code, ms]) => ({ cmd, code, ms: Number(ms) })).sort((a, b) => b.ms - a.ms)
for (const g of git.slice(0, 15)) console.log(`  ${fmt(g.ms)}  ${g.cmd.slice(0, 110)}${g.code === '0' ? '' : `  (código ${g.code})`}`)
console.log(`  total: ${git.length} comandos, ${git.reduce((s, g) => s + g.ms, 0)} ms somados`)

const long = r.long.sort((a, b) => b.ms - a.ms)
console.log(`\nLong tasks do renderer (>50ms, bloqueiam a thread): ${long.length}, ${long.reduce((s, x) => s + x.ms, 0).toFixed(0)} ms somados`)
for (const x of long.slice(0, 5)) console.log(`  ${fmt(x.ms)}  começou em ${(r.origin + x.start - last.t0).toFixed(0)} ms desde o spawn`)

if (profileFile) await summarizeProfile(profileFile)
for (const x of results) rmSync(x.userData, { recursive: true, force: true })

/** Tempo de CPU próprio (self) do renderer por lib/arquivo de origem e por função, via sourcemap do bundle. */
async function summarizeProfile(file) {
  const profile = JSON.parse(readFileSync(file, 'utf8'))
  const self = new Map()
  profile.samples.forEach((id, i) => self.set(id, (self.get(id) ?? 0) + (profile.timeDeltas[i] ?? 0) / 1000))
  const maps = new Map()
  const assets = 'dist/assets'
  const { SourceMapConsumer } = await import('source-map-js')
  for (const f of readdirSync(assets).filter((f) => f.endsWith('.js.map'))) maps.set(f.slice(0, -4), new SourceMapConsumer(JSON.parse(readFileSync(path.join(assets, f), 'utf8'))))
  if (!maps.size) console.log('\n(sem sourcemap: rode `bunx vite build --sourcemap` para ver por lib/arquivo)')
  const byLib = new Map(), byFn = new Map()
  const add = (m, k, ms) => m.set(k, (m.get(k) ?? 0) + ms)
  for (const node of profile.nodes) {
    const ms = self.get(node.id) ?? 0
    if (!ms) continue
    const { url, functionName, lineNumber, columnNumber } = node.callFrame
    const map = maps.get(url.split('/').pop())
    const pos = map?.originalPositionFor({ line: lineNumber + 1, column: columnNumber })
    const src = pos?.source ?? (url ? url.split('/').pop() : functionName.startsWith('(') ? functionName : `(nativo) ${functionName}`)
    const lib = src.includes('node_modules/') ? src.split('node_modules/').pop().split('/').slice(0, src.split('node_modules/').pop().startsWith('@') ? 2 : 1).join('/') : src.replace(/^(\.\.\/)+/, '')
    add(byLib, lib, ms)
    add(byFn, `${pos?.name || functionName || '(anônima)'}  ${lib}${pos?.line ? `:${pos.line}` : ''}`, ms)
  }
  const top = (m, n) => [...m].sort((a, b) => b[1] - a[1]).slice(0, n)
  const total = [...self.values()].reduce((s, x) => s + x, 0)
  console.log(`\nCPU do renderer até o grafo (${total.toFixed(0)} ms amostrados) por lib/arquivo`)
  for (const [k, ms] of top(byLib, 15)) console.log(`  ${fmt(ms)}  ${k}`)
  console.log('\nFunções com mais tempo próprio')
  for (const [k, ms] of top(byFn, 20)) console.log(`  ${fmt(ms)}  ${k}`)
  console.log(`\nPerfil completo (abra no DevTools › Performance ou em speedscope.app): ${file}`)
}
