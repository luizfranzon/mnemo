import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { DiffLine, FileDiff } from '../bridge/types'
import { diffParts, highlightLines, type Part } from './syntax'

const colored = (parts: Part[]) => parts.filter((p) => p.c !== 'default' && p.c !== 'punctuation').map((p) => `${p.c}:${p.t}`)

test('highlightLines usa o parser da linguagem pela extensão', () => {
  const [line] = highlightLines('const node = computed<Node | null>(() => this.data()?.type ?? 1)', 'a.ts')
  assert.deepEqual(colored(line!), ['keyword:const', 'keyword:=', 'function:computed', 'type:Node', 'keyword:|', 'constant:null',
    'keyword:=>', 'constant:this', 'function:data', 'keyword:??', 'constant:1'])
})

test('highlightLines mantém comentário e string de várias linhas na cor certa', () => {
  const lines = highlightLines('/* a\nb */\nconst s = `x\ny`', 'a.ts')
  assert.deepEqual(lines.map(colored), [['comment:/* a'], ['comment:b */'], ['keyword:const', 'keyword:=', 'string:`x'], ['string:y`']])
})

test('highlightLines sem parser para a extensão cai no highlight genérico e preserva o texto', () => {
  const lines = highlightLines('if x {\n  y\n}', 'a.desconhecida')
  assert.equal(lines.length, 3)
  assert.deepEqual(colored(lines[0]!), ['keyword:if'])
  assert.equal(lines.map((l) => l.map((p) => p.t).join('')).join('\n'), 'if x {\n  y\n}')
})

test('diffParts parseia antes e depois separados e indexa pela linha do diff', () => {
  const line = (kind: DiffLine['kind'], text: string): DiffLine => ({ kind, text, old: 1, new: 1, noNewline: false, hunk: 0 })
  const lines = [line('del', 'let a = "x'), line('add', 'let a = 1'), line('context', '"')]
  const diff = { path: 'a.ts', lines } as unknown as FileDiff
  const parts = diffParts(diff)
  assert.deepEqual(parts.map(colored), [['keyword:let', 'keyword:=', 'string:"x'], ['keyword:let', 'keyword:=', 'constant:1'], ['string:"']])
})
