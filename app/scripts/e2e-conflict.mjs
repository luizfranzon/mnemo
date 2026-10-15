// Editor de conflito: A/B com fundo, `+` por linha na ordem do clique, Resultado editável (CodeMirror) e bloqueio de marcadores.
// Uso: `bun run build && node scripts/e2e-conflict.mjs`
import assert from 'node:assert/strict'
import { readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const file = (text) => writeFileSync(path.join(repo, 'a.txt'), text)
file('um\nbase\ntres\n'); g('add', '.'); g('commit', '-q', '-m', 'base')
g('checkout', '-q', '-b', 'feat'); file('um\nF1\nF2\ntres\n'); g('commit', '-qam', 'feat')
g('checkout', '-q', 'main'); file('um\nM1\ntres\n'); g('commit', '-qam', 'main')

const ui = await launch(repo, 9344)
const { ev, until, click } = ui
const result = `[...document.querySelectorAll('.result-editor .cm-line')].map((l) => l.textContent).join('\\n')`
const take = (side, n) => ev(`document.querySelectorAll('.conflict-half.${side}.hot .conflict-take button')[${n}].click()`)
try {
  await until(() => ev(`!!document.querySelector('[data-testid=current-branch]')`), true)
  const p = JSON.stringify(repo)
  await ev(`window.__mnemo.invoke('execute_operation', { path: ${p}, kind: { type: 'merge', target: 'feat' } })`)
  await until(() => ev(`!!document.querySelector('.graph-wip')`), true)
  await ev(`document.querySelector('.graph-wip').closest('.graph-row').click()`)
  await until(() => ev(`!!document.querySelector('.conflict-file')`), true)
  await ev(`document.querySelector('.conflict-file').click()`)
  await until(() => ev(`!!document.querySelector('.result-editor .cm-content')`), true)

  assert.match(await ev(`document.querySelector('.conflict-head.ours').textContent`), /Atual commit \w{7} em main/)
  assert.match(await ev(`document.querySelector('.conflict-head.theirs').textContent`), /Entrando commit \w{7} em feat/)
  assert.equal(await ev(`document.querySelectorAll('.conflict-half.ours.hot').length`), 1)
  assert.equal(await ev(`document.querySelectorAll('.conflict-half.theirs.hot').length`), 2)
  assert.equal(await ev(result), 'um\nbase\ntres\n', 'sem escolha mostra a base, sem marcadores')

  await take('theirs', 1); await take('ours', 0); await take('theirs', 0)
  await until(() => ev(result), 'um\nF2\nM1\nF1\ntres\n')
  assert.equal(await ev(`[...document.querySelectorAll('.cm-origin .cm-gutterElement')].map((e) => e.textContent).join('')`).then((t) => t.replace(/\s/g, '')), 'BAB')

  await ev(`document.querySelector('.conflict-head.theirs input').click()`) // lado B inteiro: tira B
  await until(() => ev(result), 'um\nM1\ntres\n')

  // editar à mão trava as escolhas
  await ev(`(() => { document.querySelector('.result-editor .cm-content').focus(); document.execCommand('insertText', false, 'x') })()`)
  await until(() => ev(`document.querySelector('.conflict-take button').disabled`), true)
  await click('Reset')
  await until(() => ev(result), 'um\nbase\ntres\n')

  // gravar com marcadores não marca resolvido; marcar resolvido recusa
  await click('Salvar'); await until(() => ev(`!!document.querySelector('dialog[open]')`), true)
  await click('Gravar com marcadores')
  await until(() => ev(`!document.querySelector('.result-editor')`), true)
  assert.match(readFileSync(path.join(repo, 'a.txt'), 'utf8'), /<<<<<<< Atual\nM1\n=======\nF1\nF2\n>>>>>>> Entrando/)
  await ev(`document.querySelector('.conflict-file button').click()`)
  await new Promise((r) => setTimeout(r, 800))
  assert.ok(await ev(`!!document.querySelector('.conflict-file')`), 'continua em conflito')
  console.log('OK: editor de conflito')
} finally { ui.close() }
process.exit(0)
