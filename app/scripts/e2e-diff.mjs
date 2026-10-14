// Diff do arquivo, stage por linha e stash dos selecionados, pela UI. Uso: `bun run build && node scripts/e2e-diff.mjs`
import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launch, makeRepo } from './e2e-lib.mjs'

const { repo, g } = makeRepo()
const f = (n) => path.join(repo, n)
const body = Array.from({ length: 20 }, (_, i) => `l${i + 1}`).join('\n') + '\n'
writeFileSync(f('a.txt'), body)
writeFileSync(f('b.txt'), 'b\n')
g('add', '.')
g('commit', '-q', '-m', 'x')
writeFileSync(f('a.txt'), body.replace('l2\n', 'L2\n').replace('l18\n', 'L18\n'))
writeFileSync(f('b.txt'), 'b mudou\n')
writeFileSync(f('c.txt'), 'novo\n')

const ui = await launch(repo, 9341)
const { ev, until, click } = ui
const q = (sel) => JSON.stringify(sel)
const exists = (sel) => ev(`!!document.querySelector(${q(sel)})`)
const fileRow = (name) => `[...document.querySelectorAll('.wip-file')].find((r) => r.querySelector('.wip-name')?.textContent === ${q(name)})`
try {
  await until(() => ev(`!!document.querySelector('.graph-wip')`), true)
  await ev(`document.querySelector('.graph-wip').closest('.graph-row').click()`)
  await until(() => ev(`!!(${fileRow('a.txt')})`), true)

  // clique no arquivo abre o diff; o painel de refs vira rail
  await ev(`${fileRow('a.txt')}.click()`)
  await until(() => exists('.diff-view'), true)
  await until(() => ev(`document.querySelector('.diff-tools')?.textContent.includes('Trecho 1 de 2') ?? false`), true)
  assert.ok(await exists('.panel-left.rail'), 'painel de refs recolhido em rail')

  // lado a lado: a área vazia aparece só onde falta linha; o layout fica lembrado
  await click('Lado a lado')
  await until(() => exists('.diff-split .diff-half.add'), true)
  await click('Trechos')
  await until(() => exists('.diff-hunk'), true)

  // stage por linha: "−l2" e, com Shift, até "+L2" vão para o index; o trecho do L18 continua fora
  const gutter = (kind, text) => `[...document.querySelectorAll('.diff-line.${kind}')].find((l) => l.textContent.endsWith(${q(text)})).querySelector('button.diff-gutter')`
  await ev(`${gutter('del', 'l2')}.click()`)
  await ev(`${gutter('add', 'L2')}.dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true }))`)
  await until(() => click('Preparar 2 linhas'), true)
  await until(() => g('diff', '--cached', '--name-only').toString().trim(), 'a.txt')
  const staged = g('diff', '--cached').toString()
  assert.ok(staged.includes('+L2') && staged.includes('-l2') && !staged.includes('L18'), staged)
  assert.ok(g('diff').toString().includes('+L18'), 'o diretório de trabalho não muda')
  await until(() => ev(`document.querySelector('.diff-tools')?.textContent.includes('Trecho 1 de 1') ?? false`), true)

  // Esc fecha o diff e o painel de refs volta
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await until(() => exists('.diff-view'), false)
  assert.ok(!(await exists('.panel-left.rail')))

  // Ctrl+clique seleciona b.txt e c.txt; o menu guarda os dois no stash depois de confirmar
  await ev(`${fileRow('b.txt')}.dispatchEvent(new MouseEvent('click', { bubbles: true }))`)
  await ev(`${fileRow('c.txt')}.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }))`)
  await until(() => ev(`document.querySelectorAll('.wip-file.selected').length`), 2)
  await ev(`${fileRow('c.txt')}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 300, clientY: 300 }))`)
  await until(() => ev(`(() => { const b = [...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Guardar 2 arquivos no stash')); b?.click(); return !!b })()`), true)
  await until(() => ev(`document.querySelector('dialog[open] h2')?.textContent ?? null`), 'Guardar 2 itens no stash?')
  await ev(`[...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Guardar no stash').click()`)
  await until(() => existsSync(f('c.txt')), false)
  assert.equal(g('stash', 'list').toString().split('\n').filter(Boolean).length, 1)
  assert.ok(g('status', '--porcelain').toString().includes('a.txt'), 'a.txt ficou no WIP')

  // aplicar só c.txt do stash, pelo menu do stash no painel de refs (o clique em b.txt abriu o diff: Esc fecha)
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  const stashRow = `[...document.querySelectorAll('.refs-virtual-row')].find((r) => r.textContent.includes('stash@{0}'))`
  await until(() => ev(`!!(${stashRow})`), true)
  await ev(`${stashRow}.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 120, clientY: 300 }))`)
  await until(() => ev(`(() => { const b = [...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Aplicar arquivos do stash')); b?.click(); return !!b })()`), true)
  await until(() => ev(`[...document.querySelectorAll('.stash-apply-row label')].some((l) => l.textContent.includes('c.txt'))`), true)
  await ev(`[...document.querySelectorAll('.stash-apply-row label')].find((l) => l.textContent.includes('c.txt')).querySelector('input').click()`)
  await until(() => ev(`(() => { const b = [...document.querySelectorAll('dialog[open] button')].find((b) => b.textContent === 'Aplicar 1 arquivo'); b?.click(); return !!b })()`), true)
  await until(() => existsSync(f('c.txt')), true)
  assert.equal(g('show', 'HEAD:b.txt').toString(), 'b\n')
  assert.ok(!g('status', '--porcelain').toString().includes('b.txt'), 'b.txt continua só no stash')
  assert.equal(g('stash', 'list').toString().split('\n').filter(Boolean).length, 1, 'o stash continua na lista')
  console.log('OK: diff, layouts, stage por linha, Esc, stash dos selecionados e aplicar parte do stash')
} finally {
  ui.close()
}
process.exit(0)
