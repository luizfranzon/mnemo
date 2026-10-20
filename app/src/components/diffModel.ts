// Linhas do diff já parseadas pelo core, arrumadas por layout. Funções puras: o componente só desenha.
import type { DiffLine, FileDiff } from '../bridge/types'

export type DiffLayout = 'hunks' | 'inline' | 'split'
export const LAYOUTS: { id: DiffLayout; label: string }[] = [{ id: 'hunks', label: 'Trechos' }, { id: 'inline', label: 'Inline' }, { id: 'split', label: 'Lado a lado' }]

export type DiffRow =
  | { type: 'hunk'; key: string; hunk: number }
  | { type: 'line'; key: string; line: number }
  /** Lado a lado: `null` é a área vazia (hachurada). */
  | { type: 'split'; key: string; left: number | null; right: number | null }

/** Trechos mostra só os trechos; Inline e Lado a lado usam o arquivo inteiro (linhas sem trecho entram sem cabeçalho). */
export function diffRows(diff: FileDiff, layout: DiffLayout): DiffRow[] {
  const rows: DiffRow[] = []
  const { lines, hunks } = diff
  const hunkHead = (i: number) => {
    const h = lines[i]!.hunk
    if (h !== null && hunks[h]?.start === i) rows.push({ type: 'hunk', key: `h${h}`, hunk: h })
  }
  if (layout === 'hunks') {
    hunks.forEach((h, n) => {
      rows.push({ type: 'hunk', key: `h${n}`, hunk: n })
      for (let i = h.start; i < h.start + h.len; i++) rows.push({ type: 'line', key: `l${i}`, line: i })
    })
    return rows
  }
  if (layout === 'inline') {
    lines.forEach((_, i) => { hunkHead(i); rows.push({ type: 'line', key: `l${i}`, line: i }) })
    return rows
  }
  const split = (left: number | null, right: number | null) => rows.push({ type: 'split', key: `s${left}:${right}`, left, right })
  for (let i = 0; i < lines.length;) {
    hunkHead(i)
    const kind = lines[i]!.kind
    if (kind === 'context') { split(i, i); i++; continue }
    // um bloco de remoções seguido das adições do mesmo trecho: pareados linha a linha
    const dels: number[] = []
    const adds: number[] = []
    const hunk = lines[i]!.hunk
    while (i < lines.length && lines[i]!.kind === 'del' && lines[i]!.hunk === hunk) dels.push(i++)
    while (i < lines.length && lines[i]!.kind === 'add' && lines[i]!.hunk === hunk) adds.push(i++)
    for (let k = 0; k < Math.max(dels.length, adds.length); k++) split(dels[k] ?? null, adds[k] ?? null)
  }
  return rows
}

/** Índices (em `rows`) dos cabeçalhos de trecho, para "Trecho 1 de 2" e anterior/próximo. */
export const hunkRows = (rows: DiffRow[]) => rows.flatMap((r, i) => (r.type === 'hunk' ? [i] : []))

/** Linhas (índice em `rows`) com `needle` (já minúsculo) em algum lado; cabeçalho de trecho não conta. */
export function findRows(diff: FileDiff, rows: DiffRow[], needle: string) {
  if (!needle) return []
  const has = (i: number | null) => i !== null && diff.lines[i]!.text.toLocaleLowerCase().includes(needle)
  return rows.flatMap((r, k) => ((r.type === 'line' ? has(r.line) : r.type === 'split' && (has(r.left) || has(r.right))) ? [k] : []))
}

/** Trecho (posição em `heads`) em que a linha `row` está; busca binária porque roda a cada evento de scroll. */
export function hunkAt(heads: number[], row: number) {
  let lo = 0
  let hi = heads.length
  while (lo < hi) {
    const mid = (lo + hi) >> 1
    if (heads[mid]! <= row) lo = mid + 1
    else hi = mid
  }
  return Math.max(0, lo - 1)
}

export interface Marker { kind: 'add' | 'del'; top: number; height: number }

/** Marcadores da barra de scroll: blocos seguidos do mesmo tipo, em fração da altura total. */
export function markers(diff: FileDiff, rows: DiffRow[]): Marker[] {
  const kindOf = (r: DiffRow): Marker['kind'] | null => {
    const k = r.type === 'line' ? diff.lines[r.line]!.kind
      : r.type === 'split' ? (r.right !== null && diff.lines[r.right]!.kind === 'add' ? 'add' : r.left !== null && diff.lines[r.left]!.kind === 'del' ? 'del' : null) : null
    return k === 'add' || k === 'del' ? k : null
  }
  const out: Marker[] = []
  rows.forEach((r, i) => {
    const kind = kindOf(r)
    if (!kind) return
    const last = out.at(-1)
    if (last && last.kind === kind && Math.abs(last.top + last.height - i / rows.length) < 1e-9) last.height += 1 / rows.length
    else out.push({ kind, top: i / rows.length, height: 1 / rows.length })
  })
  return out
}

/** Linhas escolhidas (índices em `diff.lines`) no formato do `stage_lines`: só mudanças, `[trecho, linha no trecho]`. */
export function selectionArgs(diff: FileDiff, selected: Set<number>): [number, number][] {
  return [...selected].sort((a, b) => a - b).flatMap((i) => {
    const l = diff.lines[i]
    if (!l || l.kind === 'context' || l.hunk === null) return []
    return [[l.hunk, i - diff.hunks[l.hunk]!.start] as [number, number]]
  })
}

/** Linhas de mudança de um trecho (para preparar o trecho inteiro). */
export const hunkLines = (diff: FileDiff, hunk: number) => {
  const h = diff.hunks[hunk]!
  return Array.from({ length: h.len }, (_, k) => h.start + k).filter((i) => diff.lines[i]!.kind !== 'context')
}

export type Token = 'keyword' | 'string' | 'constant' | 'type' | 'function' | 'punctuation' | 'comment' | 'default'
const KEYWORDS = 'abstract|as|async|await|break|case|catch|class|const|continue|def|default|do|else|enum|export|extends|fn|for|from|func|function|if|impl|implements|import|in|interface|let|match|mut|new|package|private|protected|pub|public|readonly|return|static|struct|switch|then|throw|trait|try|type|typeof|use|var|void|while|yield'
/** Papéis do tema Dracula (TextMate) aproximados por regex, linha a linha: operador é palavra-chave, `this`/literal/número e nome declarado com const/readonly são constante, identificador seguido de `(` é chamada. */
const TOKEN = new RegExp([
  String.raw`(\/\/.*$|#.*$)`,
  String.raw`("(?:[^"\\]|\\.)*"?|'(?:[^'\\]|\\.)*'?|\x60[^\x60]*\x60?)`,
  String.raw`(?<![.\w$])(this|self|super|true|false|null|undefined|None|nil)\b`,
  String.raw`(?<![.\w$])(${KEYWORDS})\b`,
  String.raw`(=>|\?\?=?|\?(?!\.)|[=!<>+\-*/%&|^~]+)`,
  String.raw`\b([A-Z][A-Z0-9_]{2,}|\d[\w.]*)\b`,
  String.raw`(?<=\b(?:const|readonly)\s+)([A-Za-z_$][\w$]*)`,
  String.raw`\b([A-Z][A-Za-z0-9]*)\b`,
  String.raw`(?<![\w$])([a-z_$][\w$]*)(?=\s*(?:<[^()]*>)?\()`,
  String.raw`([{}()\[\]:,;.])`,
].join('|'), 'g')
const GROUPS: Token[] = ['comment', 'string', 'constant', 'keyword', 'keyword', 'constant', 'constant', 'type', 'function', 'punctuation']

/** Syntax highlight genérico por regex (paleta Dracula do 04-design-system.md), para arquivo sem parser de linguagem (`syntax.ts`). */
export function highlight(text: string): { t: string; c: Token }[] {
  const out: { t: string; c: Token }[] = []
  let last = 0
  TOKEN.lastIndex = 0
  for (let m = TOKEN.exec(text); m; m = TOKEN.exec(text)) {
    if (!m[0]) { TOKEN.lastIndex++; continue }
    if (m.index > last) out.push({ t: text.slice(last, m.index), c: 'default' })
    out.push({ t: m[0], c: GROUPS[m.slice(1).findIndex((g) => g !== undefined)] ?? 'default' })
    last = m.index + m[0].length
  }
  if (last < text.length) out.push({ t: text.slice(last), c: 'default' })
  return out
}

/** Texto como o editor mostra: sem o `\r` do CRLF. */
export const display = (l: DiffLine) => (l.text.endsWith('\r') ? l.text.slice(0, -1) : l.text)
