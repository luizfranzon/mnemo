import type { Language } from '@codemirror/language'
import { tsxLanguage, typescriptLanguage, javascriptLanguage, jsxLanguage } from '@codemirror/lang-javascript'
import { javaLanguage } from '@codemirror/lang-java'
import { pythonLanguage } from '@codemirror/lang-python'
import { rustLanguage } from '@codemirror/lang-rust'
import { cssLanguage } from '@codemirror/lang-css'
import { sass, sassLanguage } from '@codemirror/lang-sass'
import { htmlLanguage } from '@codemirror/lang-html'
import { xmlLanguage } from '@codemirror/lang-xml'
import { jsonLanguage } from '@codemirror/lang-json'
import { markdownLanguage } from '@codemirror/lang-markdown'
import { yamlLanguage } from '@codemirror/lang-yaml'
import { StandardSQL } from '@codemirror/lang-sql'
import { highlightTree, styleTags, tagHighlighter, tags as t } from '@lezer/highlight'
import type { FileDiff } from '../bridge/types'
import { display, highlight, type Token } from './diffModel'

export type Part = { t: string; c: Token }

const scss = sass({ indented: false }).language
/** O Lezer não marca como chamada o nome numa chamada com tipo genérico (`computed<T>(…)`); o VSCode marca. */
const generic = { props: [styleTags({
  'InstantiationExpression/VariableName': t.function(t.variableName),
  'InstantiationExpression/MemberExpression/PropertyName': t.function(t.propertyName),
})] }
const ts = typescriptLanguage.configure(generic)
const tsx = tsxLanguage.configure(generic)
const BY_EXT: Record<string, Language> = {
  ts, mts: ts, cts: ts, tsx,
  js: javascriptLanguage, mjs: javascriptLanguage, cjs: javascriptLanguage, jsx: jsxLanguage,
  java: javaLanguage, py: pythonLanguage, rs: rustLanguage,
  css: cssLanguage, scss, sass: sassLanguage, less: cssLanguage,
  html: htmlLanguage, htm: htmlLanguage, xhtml: htmlLanguage, vue: htmlLanguage, svelte: htmlLanguage,
  xml: xmlLanguage, svg: xmlLanguage, json: jsonLanguage, jsonc: jsonLanguage,
  md: markdownLanguage, markdown: markdownLanguage, yml: yamlLanguage, yaml: yamlLanguage, sql: StandardSQL.language,
}

/** Linguagem do arquivo pela extensão; `null` cai no highlight genérico por regex. */
export const languageFor = (file: string): Language | null => BY_EXT[file.slice(file.lastIndexOf('.') + 1).toLowerCase()] ?? null

/** Tags do Lezer → papéis do tema Dracula (Min Darkest Dracula). O mais específico ganha (`self` antes de `keyword`). */
export const dracula = tagHighlighter([
  { tag: [t.keyword, t.operator, t.function(t.punctuation), t.escape, t.tagName], class: 'syn-keyword' },
  { tag: [t.self, t.null, t.bool, t.atom, t.number, t.constant(t.variableName), t.constant(t.name), t.heading], class: 'syn-constant' },
  { tag: [t.string, t.regexp, t.character, t.docString], class: 'syn-string' },
  { tag: [t.typeName, t.className, t.namespace, t.url], class: 'syn-type' },
  { tag: [t.function(t.variableName), t.function(t.propertyName), t.macroName, t.attributeName], class: 'syn-function' },
  { tag: t.comment, class: 'syn-comment' },
  { tag: [t.punctuation, t.derefOperator], class: 'syn-punctuation' },
])

// shortcut: acima disso o parse do arquivo inteiro custa mais que o ganho, cai na regex; subir se diffs grandes ficarem feios
const MAX = 1 << 20

/** Partes coloridas de cada linha de `text`, com o parser da linguagem de `file` (strings e comentários de várias linhas saem certos). */
export function highlightLines(text: string, file: string): Part[][] {
  const lang = languageFor(file)
  const lines = text.split('\n')
  if (!lang || text.length > MAX) return lines.map(highlight)
  const spans: { from: number; to: number; c: Token }[] = []
  highlightTree(lang.parser.parse(text), dracula, (from, to, cls) => spans.push({ from, to, c: cls.split(' ')[0]!.slice(4) as Token }))
  const out: Part[][] = []
  let s = 0
  let start = 0
  for (const line of lines) {
    const end = start + line.length
    const parts: Part[] = []
    let at = start
    while (s < spans.length && spans[s]!.to <= start) s++
    for (let k = s; k < spans.length && spans[k]!.from < end; k++) {
      const from = Math.max(spans[k]!.from, at)
      const to = Math.min(spans[k]!.to, end)
      if (to <= from) continue
      if (from > at) parts.push({ t: text.slice(at, from), c: 'default' })
      parts.push({ t: text.slice(from, to), c: spans[k]!.c })
      at = to
    }
    if (end > at) parts.push({ t: text.slice(at, end), c: 'default' })
    out.push(parts)
    start = end + 1
  }
  return out
}

/** Partes de cada linha do diff (índice de `diff.lines`): cada lado é parseado inteiro (antes = contexto + removidas, depois = contexto + adicionadas). */
export function diffParts(diff: FileDiff): Part[][] {
  const out: Part[][] = new Array(diff.lines.length)
  for (const side of ['del', 'add'] as const) {
    const idx = diff.lines.flatMap((l, i) => (l.kind === side || l.kind === 'context' ? [i] : []))
    const parts = highlightLines(idx.map((i) => display(diff.lines[i]!)).join('\n'), diff.path)
    idx.forEach((i, k) => { out[i] = parts[k]! })
  }
  return out
}
