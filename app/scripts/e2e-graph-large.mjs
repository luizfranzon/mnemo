// 2.100 commits: o DOM fica virtualizado e a rolagem pede a segunda página.
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
g('commit', '-q', '--allow-empty', '-m', 'base')
const base = g('rev-parse', 'HEAD').toString().trim()
let stream = ''
for (let i = 1; i <= 2100; i++) stream += `commit refs/heads/main\nmark :${i}\ncommitter Teste <teste@example.com> ${1700000000 + i} +0000\ndata 1\nx\nfrom ${i === 1 ? base : `:${i - 1}`}\n\n`
const imported = spawnSync('git', ['fast-import', '--quiet'], { cwd: repo, input: stream })
assert.equal(imported.status, 0, imported.stderr?.toString())
const ui = await launch(repo, 9341)
const { ev, until } = ui
try {
  await until(() => ev(`document.querySelector('.graph-list > div')?.style.height === '${2001 * 28}px'`), true)
  assert.ok(await ev(`document.querySelectorAll('.graph-row').length`) < 100)
  await ev(`(() => { const list=document.querySelector('.graph-list'); list.scrollTop=list.scrollHeight; list.dispatchEvent(new Event('scroll',{bubbles:true})); return true })()`)
  await until(() => ev(`document.querySelector('.graph-list > div')?.style.height === '${2102 * 28}px'`), true)
  assert.ok(await ev(`document.querySelectorAll('.graph-row').length`) < 100)
  assert.ok(await ev(`document.querySelector('.graph-list').scrollTop`) > 50_000, 'rolagem não volta ao topo ao carregar mais')
  console.log('OK: 2.101 commits em duas páginas, DOM virtualizado')
} finally { ui.close() }
process.exit(0)
