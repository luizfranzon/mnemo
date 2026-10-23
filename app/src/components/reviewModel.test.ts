import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DiffLine, FileDiff, Review, ReviewComment, ReviewFile, ReviewRound } from '../bridge/types'
import { diffRows } from './diffModel'
import { anchorOf, lineLabel, nextFile, rangeOf, reportName, reviewMarks, reviewMenu, reviewReport, reviewRows, visibleComments } from './reviewModel'

/** `c 1 1` = contexto antigo 1 / novo 1; `- 2` = removida (antiga 2); `+ 2` = adicionada (nova 2). */
function diff(spec: string[]): FileDiff {
  const lines: DiffLine[] = spec.map((s) => {
    const [k, a, b] = s.split(' ')
    const kind = k === '+' ? 'add' : k === '-' ? 'del' : 'context'
    const old = kind === 'add' ? null : Number(a)
    const neu = kind === 'del' ? null : Number(kind === 'add' ? a : b)
    return { kind, old, new: neu, text: `t${s}`, noNewline: false, hunk: 0 }
  })
  return { path: 'a.ts', oldPath: null, binary: false, tooLarge: false, encoding: 'UTF-8', encodingId: 'utf-8', guessed: false, stageable: true,
    added: 0, removed: 0, hunks: [{ header: '@@', oldStart: 1, oldLines: 1, newStart: 1, newLines: 1, start: 0, len: lines.length }], lines }
}

const comment = (over: Partial<ReviewComment>): ReviewComment =>
  ({ id: 'c', file: 'a.ts', oldPath: null, lines: { side: 'new', start: 1, end: 1 }, snippet: ['x'], body: 'b', scope: 'round', ...over })

const round = (over: Partial<ReviewRound> = {}): ReviewRound => ({ number: 1, base: 'main', mergeBase: 'a'.repeat(40), from: null, tip: 'b'.repeat(40),
  startedMs: Date.UTC(2026, 9, 23, 12), concludedMs: null, reviewed: [], comments: [], ...over })

const file = (path: string, over: Partial<ReviewFile> = {}): ReviewFile => ({ path, oldPath: null, status: 'M', added: 1, removed: 0, reverted: false, ...over })

test('rótulo da linha: única, intervalo, removida e arquivo inteiro', () => {
  assert.equal(lineLabel({ side: 'new', start: 4, end: 4 }), 'L4')
  assert.equal(lineLabel({ side: 'new', start: 4, end: 9 }), 'L4–9')
  assert.equal(lineLabel({ side: 'old', start: 2, end: 3 }), 'L2–3 (removido)')
  assert.equal(lineLabel(null), 'Arquivo inteiro')
})

test('âncora no unificado: só remoções ficam no lado antigo; trecho misto guarda as marcas', () => {
  const d = diff(['c 1 1', '- 2', '- 3', '+ 2', 'c 4 3'])
  assert.deepEqual(anchorOf(d, 2, 1), { lines: { side: 'old', start: 2, end: 3 }, snippet: ['t- 2', 't- 3'] })
  assert.deepEqual(anchorOf(d, 0, 4), { lines: { side: 'new', start: 1, end: 3 }, snippet: ['  tc 1 1', '- t- 2', '- t- 3', '+ t+ 2', '  tc 4 3'] })
})

test('âncora no lado a lado segue o lado clicado e ignora linhas que não existem nele', () => {
  const d = diff(['c 1 1', '- 2', '+ 2'])
  assert.deepEqual(anchorOf(d, 0, 2, 'new'), { lines: { side: 'new', start: 1, end: 2 }, snippet: ['tc 1 1', 't+ 2'] })
  assert.equal(anchorOf(d, 2, 2, 'old'), null)
})

test('comentário entra logo abaixo da linha em que termina; o de arquivo inteiro e o rascunho do arquivo vão para o topo', () => {
  const d = diff(['c 1 1', '- 2', '+ 2', 'c 3 3'])
  const rows = diffRows(d, 'hunks')
  const out = reviewRows(rows, d, [comment({ id: 'n', lines: { side: 'new', start: 2, end: 2 } }), comment({ id: 'f', lines: null }),
    comment({ id: 'o', lines: { side: 'old', start: 2, end: 2 } })], { id: null, end: null, side: 'new' })
  assert.deepEqual(out.map((r) => r.key), ['cf', 'composer', 'h0', 'l0', 'l1', 'co', 'l2', 'cn', 'l3'])
})

test('no lado a lado o comentário segue a metade do lado dele; editar tira o original e põe a caixa no lugar', () => {
  const d = diff(['c 1 1', '- 2', '+ 2'])
  const rows = diffRows(d, 'split')
  const out = reviewRows(rows, d, [comment({ id: 'n', lines: { side: 'new', start: 2, end: 2 } })], { id: 'n', end: 2, side: 'new' })
  assert.deepEqual(out.map((r) => r.key), ['s0:0', 's1:2', 'composer'])
})

test('comentário de linha que não aparece no diff fica de fora', () => {
  const d = diff(['c 1 1'])
  assert.deepEqual(reviewRows(diffRows(d, 'hunks'), d, [comment({ lines: { side: 'new', start: 9, end: 9 } })], null).map((r) => r.key), ['h0', 'l0'])
})

test('lado antigo só aparece no recorte em que o comentário foi feito', () => {
  const all = [comment({ id: 'a', lines: { side: 'old', start: 1, end: 1 }, scope: 'branch' }), comment({ id: 'b', scope: 'branch' }), comment({ id: 'c', file: 'b.ts' })]
  assert.deepEqual(visibleComments(all, 'a.ts', 'round').map((c) => c.id), ['b'])
  assert.deepEqual(visibleComments(all, 'a.ts', 'branch').map((c) => c.id), ['a', 'b'])
})

test('próximo arquivo pula revisados e revertidos e dá a volta', () => {
  const files = [file('a'), file('b'), file('c', { reverted: true }), file('d')]
  assert.equal(nextFile(files, ['b'], 'a')?.path, 'd')
  assert.equal(nextFile(files, ['b'], 'd')?.path, 'a')
  assert.equal(nextFile(files, ['a', 'b', 'd'], 'd'), null)
  assert.equal(nextFile(files, [], null)?.path, 'a')
})

test('recorte: a primeira Rodada e a Branch inteira partem do merge-base; as seguintes, do commit revisado', () => {
  assert.equal(rangeOf(round(), 'round').from, 'a'.repeat(40))
  assert.equal(rangeOf(round({ from: 'c'.repeat(40) }), 'round').from, 'c'.repeat(40))
  assert.equal(rangeOf(round({ from: 'c'.repeat(40) }), 'branch').from, 'a'.repeat(40))
})

test('relatório: arquivos em ordem, linhas em ordem, trecho cercado sem linguagem e arquivo inteiro por último', () => {
  const r = round({ number: 2, from: 'c'.repeat(40), comments: [
    comment({ id: '1', file: 'src/z.ts', lines: { side: 'new', start: 9, end: 10 }, snippet: ['nove', 'dez'], body: 'segundo' }),
    comment({ id: '2', file: 'src/z.ts', lines: null, snippet: [], body: 'geral' }),
    comment({ id: '3', file: 'src/z.ts', lines: { side: 'old', start: 3, end: 3 }, snippet: ['tres'], body: 'primeiro', scope: 'branch' }),
    comment({ id: '4', file: 'src/a.ts', oldPath: 'src/velho.ts', snippet: ['```x'], body: 'crases' }),
  ] })
  const review: Review = { branch: 'feature/x', rounds: [r] }
  assert.equal(reviewReport(review, r, [file('src/a.ts', { oldPath: 'src/velho.ts' })]), [
    '# Revisão de feature/x → main (rodada 2)',
    'ccccccc..bbbbbbb · 23/10/2026',
    '',
    '## src/a.ts (renomeado de src/velho.ts)',
    '',
    '**L1**',
    '````',
    '```x',
    '````',
    'crases',
    '',
    '## src/z.ts',
    '',
    '**L3 (removido)** (branch inteira)',
    '```',
    'tres',
    '```',
    'primeiro',
    '',
    '**L9–10**',
    '```',
    'nove',
    'dez',
    '```',
    'segundo',
    '',
    '**Arquivo inteiro**',
    'geral',
    '',
  ].join('\n'))
})

test('menu: estado de cada Revisão à direita; rodada nova só quando a branch andou depois da concluída', () => {
  const status = { tip: 'f'.repeat(40), ahead: 0, rewritten: false, merged: false }
  const calls: string[] = []
  const items = reviewMenu([
    { branch: 'a', round: 1, open: true, reviewed: 2, files: 5, status, markers: [] },
    { branch: 'b', round: 2, open: false, reviewed: 3, files: 3, status: { ...status, ahead: 4 }, markers: [] },
    { branch: 'c', round: 1, open: false, reviewed: 1, files: 1, status: { ...status, tip: null }, markers: [] },
  ], 'a', { open: (b) => calls.push(`open:${b}`), next: (b) => calls.push(`next:${b}`), end: (b) => calls.push(`end:${b}`), back: () => calls.push('back') })
  const entry = (label: string) => items.find((i) => i !== '-' && i.label === label) as Exclude<typeof items[number], '-'>
  assert.equal(entry('a').shortcut, 'rodada 1 · 2/5')
  assert.equal(entry('b').shortcut, 'commits novos')
  assert.equal(entry('c').shortcut, 'branch não existe mais')
  assert.ok((entry('a').submenu![0] as { reason?: string }).reason, 'a aberta não reabre')
  const next = entry('b').submenu!.find((i) => i !== '-' && i.label === 'Começar rodada 3') as { run: () => void }
  next.run()
  entry('Voltar ao grafo').run!()
  assert.deepEqual(calls, ['next:b', 'back'])
  assert.equal(entry('c').submenu!.some((i) => i !== '-' && i.label.startsWith('Começar')), false)
})

test('marcadores por commit, com o texto de revisado e o de branch reescrita', () => {
  const status = { tip: 'f'.repeat(40), ahead: 0, rewritten: false, merged: false }
  const at = Date.UTC(2026, 9, 23, 12)
  const marks = reviewMarks([
    { branch: 'a', round: 2, open: true, reviewed: 0, files: 0, status, markers: [{ sha: 's1', round: 1, comments: 2, concludedMs: at, rewritten: false, reviewed: 's1' }] },
    { branch: 'b', round: 1, open: false, reviewed: 0, files: 0, status, markers: [{ sha: 's1', round: 1, comments: 0, concludedMs: at, rewritten: true, reviewed: 'abcdef123456' }] },
  ])
  assert.deepEqual(marks.get('s1')?.map((m) => m.title), [
    'a: revisado na rodada 1 em 23/10/2026, 2 comentários',
    'b: a rodada 1 revisou abcdef1, antes de a branch ser reescrita',
  ])
})

test('menu sem Revisões explica como começar', () => {
  const items = reviewMenu([], undefined, { open: () => {}, next: () => {}, end: () => {}, back: () => {} })
  assert.ok((items[1] as { reason?: string }).reason)
  assert.equal(items.some((i) => i !== '-' && i.label === 'Voltar ao grafo'), false)
})

test('relatório sem comentários diz isso; nome do arquivo sem barras', () => {
  const r = round()
  assert.match(reviewReport({ branch: 'x', rounds: [r] }, r, []), /Nenhum comentário nesta rodada\./)
  assert.equal(reportName('feature/x y', 3), 'revisao-feature-x-y-rodada-3.md')
})
