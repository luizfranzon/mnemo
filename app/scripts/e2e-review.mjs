// Revisão pela UI: revisar a branch pelo menu, comentar um trecho, marcar, concluir e ver o marcador no grafo.
// Uso: `bun run build && node scripts/e2e-review.mjs [pasta-dos-screenshots]`
import { writeFileSync } from 'node:fs'
import path from 'node:path'
import assert from 'node:assert/strict'
import { launch, makeRepo, sleep } from './e2e-lib.mjs'

const shots = process.argv[2]
const { repo, g } = makeRepo()
const f = (n) => path.join(repo, n)
writeFileSync(f('a.txt'), Array.from({ length: 12 }, (_, i) => `linha ${i + 1}`).join('\n') + '\n')
g('add', '.')
g('commit', '-q', '-m', 'inicial')
g('switch', '-q', '-c', 'feature')
writeFileSync(f('a.txt'), Array.from({ length: 12 }, (_, i) => (i === 4 ? 'LINHA 5' : `linha ${i + 1}`)).join('\n') + '\n')
g('commit', '-qam', 'muda a')
writeFileSync(f('b.txt'), 'rascunho\n')
g('add', '.')
g('commit', '-q', '-m', 'b')
writeFileSync(f('b.txt'), 'final\n')
g('commit', '-qam', 'b de novo')
g('switch', '-q', 'main')

const ui = await launch(repo, 9351)
const { ev, until, click, send } = ui
const q = (s) => JSON.stringify(s)
const exists = (sel) => ev(`!!document.querySelector(${q(sel)})`)
const shot = async (name) => {
  if (!shots) return
  await sleep(300)
  const { result } = await send('Page.captureScreenshot', { format: 'png' })
  writeFileSync(path.join(shots, `${name}.png`), Buffer.from(result.data, 'base64'))
}
try {
  await until(() => exists('.graph-pill'), true)
  // clique direito na pill da feature → Revisar feature
  await ev(`[...document.querySelectorAll('.graph-pill')].find((p) => p.textContent.includes('feature')).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, clientX: 200, clientY: 120 }))`)
  await until(() => ev(`!![...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Revisar feature'))`), true)
  await ev(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Revisar feature')).click()`)
  await until(() => exists('dialog[open] #review-base'), true)
  assert.equal(await ev(`document.querySelector('#review-base').value`), 'main', 'Base padrão')
  await shot('1-dialogo')
  await click('Começar revisão')

  // modo Revisão: rótulo da aba, lista com os dois arquivos e o primeiro aberto
  await until(() => ev(`document.querySelector('.tab.active .tab-label')?.textContent`), `Revisão: ${path.basename(repo)} - feature`)
  await until(() => ev(`document.querySelectorAll('.review-file').length`), 2)
  assert.equal(await ev(`document.querySelector('.review-count').textContent`), '0 de 2 revisados')
  await until(() => exists('.diff-view .diff-line'), true)
  assert.equal(await ev(`[...document.querySelectorAll('.review-file')].map((r) => r.classList.contains('active')).join()`), 'true,false')

  // b.txt nasceu na branch: o diff mostra só "final", sem o rascunho intermediário
  await ev(`[...document.querySelectorAll('.review-file')][1].click()`)
  await until(() => ev(`[...document.querySelectorAll('.diff-line.add')].map((l) => l.textContent).join('|').includes('final')`), true)
  assert.equal(await ev(`document.querySelector('.diff-view').textContent.includes('rascunho')`), false)

  // comenta a linha 5 de a.txt
  await ev(`[...document.querySelectorAll('.review-file')][0].click()`)
  await until(() => ev(`document.querySelector('.diff-line.add')?.textContent.includes('LINHA 5') ?? false`), true)
  const press = (sel) => ev(`(() => { const b = ${sel}; b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 })); return true })()`)
  const drag = (from, to) => ev(`(() => { const a = ${from}, b = ${to}
    a.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0, buttons: 1 }))
    a.dispatchEvent(new PointerEvent('pointerout', { bubbles: true, buttons: 1, relatedTarget: b }))
    b.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, buttons: 1, relatedTarget: a }))
    window.dispatchEvent(new PointerEvent('pointerup', { bubbles: true })); return true })()`)
  const write = (text) => ev(`(() => { const t = document.querySelector('.review-note.composer textarea'); const set = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value').set; set.call(t, ${q(text)}); t.dispatchEvent(new Event('input', { bubbles: true })) })()`)
  await press(`document.querySelector('.diff-line.add button.diff-gutter')`)
  await ev(`window.dispatchEvent(new PointerEvent('pointerup'))`)
  await until(() => exists('.review-note.composer textarea'), true)
  await write('Por que maiúsculo?')
  await ev(`document.querySelector('.review-note.composer button.primary').click()`)
  await until(() => ev(`document.querySelector('.review-note:not(.composer) .review-note-body')?.textContent`), 'Por que maiúsculo?')
  await shot('2-comentario')

  // lado a lado: arrastar pelos números da direita pega várias linhas, e o card fica na metade direita
  await click('Lado a lado')
  await until(() => ev(`[...document.querySelectorAll('.diff-half.right .diff-num')].some((n) => n.textContent === '1')`), true)
  const right = (n) => `[...document.querySelectorAll('.diff-half.right button.diff-gutter')].find((b) => b.querySelector('.diff-num').textContent === '${n}')`
  await drag(right(3), right(4))
  await until(() => ev(`document.querySelector('.review-note.composer.right .review-note-head')?.textContent`), 'L3–4')
  await write('Trecho inteiro')
  await ev(`document.querySelector('.review-note.composer button.primary').click()`)
  await until(() => ev(`[...document.querySelectorAll('.review-note.right:not(.composer)')].length`), 2)
  await shot('2b-lado-a-lado')
  await click('Trechos')

  // selecionar o texto do código com o mouse também comenta: o botão flutuante pega todas as linhas da seleção
  const lineOf = (n) => `[...document.querySelectorAll('.diff-line')].find((l) => l.querySelectorAll('.diff-num')[1]?.textContent === '${n}')`
  await until(() => ev(`!!(${lineOf(2)}) && !(${lineOf(1)})`), true)
  await ev(`(() => { const r = document.createRange(); r.setStart(${lineOf(2)}.querySelector('.diff-text'), 0); r.setEnd(${lineOf(4)}.querySelector('.diff-text'), 1)
    const s = window.getSelection(); s.removeAllRanges(); s.addRange(r)
    document.querySelector('.diff-body').dispatchEvent(new MouseEvent('mouseup', { bubbles: true })) })()`)
  await until(() => ev(`document.querySelector('.review-select-comment')?.textContent ?? null`), 'Comentar L2–4')
  await ev(`document.querySelector('.review-select-comment').click()`)
  await until(() => ev(`document.querySelector('.review-note.composer .review-note-head')?.textContent`), 'L2–4')
  await write('Seleção de texto')
  await ev(`document.querySelector('.review-note.composer button.primary').click()`)
  await until(() => ev(`document.querySelectorAll('.review-note:not(.composer)').length`), 3)

  // V marca e abre o próximo
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'v' }))`)
  await until(() => ev(`document.querySelector('.review-count').textContent`), '1 de 2 revisados')
  await until(() => ev(`document.querySelector('.review-file.active .commit-name')?.textContent`), 'b.txt')

  // concluir com arquivo faltando confirma; o relatório tem arquivo, trecho e comentário
  await click('Concluir rodada')
  await until(() => exists('dialog[open]#review-conclude-title, dialog[open] #review-conclude-title'), true)
  await click('Concluir mesmo assim')
  await until(() => exists('.review-report-text'), true)
  const report = await ev(`document.querySelector('.review-report-text').textContent`)
  assert.match(report, /# Revisão de feature → main \(rodada 1\)/)
  assert.match(report, /## a\.txt\n\n\*\*L2–4\*\*\n```\nlinha 2\nlinha 3\nlinha 4\n```\nSeleção de texto\n\n\*\*L3–4\*\*\n```\nlinha 3\nlinha 4\n```\nTrecho inteiro\n\n\*\*L5\*\*\n```\nLINHA 5\n```\nPor que maiúsculo\?/)
  await shot('3-relatorio')
  await click('Fechar')

  // Esc volta ao grafo; o commit da ponta tem o marcador de revisado
  await ev(`window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))`)
  await until(() => exists('.review-panel'), false)
  await until(() => exists('.graph-review-mark'), true)
  assert.match(await ev(`document.querySelector('.graph-review-mark').title`), /feature: revisado na rodada 1/)
  await shot('4-grafo')

  // commit novo na feature: o menu Revisões oferece a rodada 2, que mostra só o que mudou
  g('switch', '-q', 'feature')
  writeFileSync(f('a.txt'), Array.from({ length: 12 }, (_, i) => (i === 4 ? 'LINHA 5' : i === 9 ? 'LINHA 10' : `linha ${i + 1}`)).join('\n') + '\n')
  g('commit', '-qam', 'muda a de novo')
  g('switch', '-q', 'main')
  await ev(`window.dispatchEvent(new Event('focus'))`)
  await ev(`[...document.querySelectorAll('.toolbar button')].find((b) => b.textContent.includes('Revisões')).click()`)
  await until(() => ev(`[...document.querySelectorAll('.menu-item')].some((b) => b.textContent.includes('commits novos'))`), true)
  await shot('5-menu')
  await ev(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('feature')).click()`)
  await until(() => ev(`!![...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Começar rodada 2'))`), true)
  await ev(`[...document.querySelectorAll('.menu-item')].find((b) => b.textContent.includes('Começar rodada 2')).click()`)
  await until(() => exists('dialog[open] #review-base'), true)
  await click('Começar rodada 2')
  await until(() => ev(`document.querySelectorAll('.review-file').length`), 1)
  await until(() => ev(`[...document.querySelectorAll('.diff-line.add')].map((l) => l.textContent).join('|').includes('LINHA 10')`), true)
  assert.equal(await ev(`[...document.querySelectorAll('.diff-line.add')].some((l) => l.textContent.includes('LINHA 5'))`), false, 'a mudança já revisada não volta')
  await shot('6-rodada2')
  console.log('ok: revisão')
} finally {
  ui.close()
}
