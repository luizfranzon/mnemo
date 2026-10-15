import type { ConflictDoc, ConflictSegment } from '../bridge/types'

export type Side = 'ours' | 'theirs'
export type Chunk = Extract<ConflictSegment, { kind: 'conflict' }>
/** Linha `i` de um lado. */
export interface Take { side: Side; i: number }
/** Linhas pegas de um trecho, na ordem do clique. `touched`: o usuário (ou o auto) já decidiu este trecho. */
export interface Pick { order: Take[]; touched: boolean }
export type State = 'none' | 'some' | 'all'

export const conflictsOf = (doc: ConflictDoc): Chunk[] =>
  doc.segments.flatMap((s) => (s.kind === 'conflict' ? [s] : []))

const range = (n: number) => Array.from({ length: n }, (_, i) => i)

/** Trecho que só difere em espaço (`auto`) já começa com o Atual pego. */
export const initialPicks = (doc: ConflictDoc): Pick[] =>
  conflictsOf(doc).map((c) => ({ order: c.auto ? range(c.ours.length).map((i) => ({ side: 'ours' as const, i })) : [], touched: c.auto }))

export const taken = (p: Pick, side: Side, i: number) => p.order.some((t) => t.side === side && t.i === i)

export const toggleLine = (p: Pick, side: Side, i: number): Pick =>
  ({ order: taken(p, side, i) ? p.order.filter((t) => t.side !== side || t.i !== i) : [...p.order, { side, i }], touched: true })

export function sideState(p: Pick, c: Chunk, side: Side): State {
  const n = p.order.filter((t) => t.side === side).length
  return n === 0 ? 'none' : n === c[side].length ? 'all' : 'some'
}

/** Lado inteiro do trecho: tira se já está todo pego; senão acrescenta as linhas que faltam. */
export function toggleSide(p: Pick, c: Chunk, side: Side): Pick {
  if (sideState(p, c, side) === 'all') return { order: p.order.filter((t) => t.side !== side), touched: true }
  const missing = range(c[side].length).filter((i) => !taken(p, side, i)).map((i) => ({ side, i }))
  return { order: [...p.order, ...missing], touched: true }
}

/** Lado de todos os trechos do arquivo (checkbox do cabeçalho). */
export function fileSideState(picks: Pick[], chunks: Chunk[], side: Side): State {
  const states = chunks.filter((c) => c[side].length > 0).map((c) => sideState(picks[chunks.indexOf(c)]!, c, side))
  return states.length > 0 && states.every((s) => s === 'all') ? 'all' : states.every((s) => s === 'none') ? 'none' : 'some'
}

export function toggleFileSide(picks: Pick[], chunks: Chunk[], side: Side): Pick[] {
  const all = fileSideState(picks, chunks, side) === 'all'
  return picks.map((p, n) => {
    const c = chunks[n]!
    if (c[side].length === 0) return p
    return all || sideState(p, c, side) !== 'all' ? toggleSide(p, c, side) : p
  })
}

export const unresolved = (picks: Pick[]) => picks.filter((p) => !p.touched).length

export type Origin = 'text' | Side | 'pending'
export interface ResultLine { text: string; origin: Origin; chunk: number | null }
export interface ResultLayout {
  lines: ResultLine[]
  /** Trecho sem escolha e sem linhas na base: ganha uma faixa antes da linha `before`, que não é texto. */
  empties: { before: number; chunk: number }[]
  /** Linha (0-based) onde cada trecho começa. */
  starts: number[]
}

/** Linhas do Resultado e de onde cada uma veio. Trecho sem escolha mostra a base. */
export function resultLayout(doc: ConflictDoc, picks: Pick[]): ResultLayout {
  const lines: ResultLine[] = []
  const empties: ResultLayout['empties'] = []
  const starts: number[] = []
  let n = 0
  for (const s of doc.segments) {
    if (s.kind === 'text') { lines.push(...s.lines.map((text) => ({ text, origin: 'text' as const, chunk: null }))); continue }
    const p = picks[n]!
    starts.push(lines.length)
    if (!p.touched) {
      if (s.base.length === 0) empties.push({ before: lines.length, chunk: n })
      lines.push(...s.base.map((text) => ({ text, origin: 'pending' as const, chunk: n })))
    } else lines.push(...p.order.map((t) => ({ text: s[t.side][t.i]!, origin: t.side, chunk: n })))
    n++
  }
  return { lines, empties, starts }
}

const join = (doc: ConflictDoc, lines: string[]) => (doc.finalNewline && lines.length ? `${lines.join('\n')}\n` : lines.join('\n'))

/** O que o Resultado mostra (e Salvar grava): trecho sem escolha vira a base. */
export const output = (doc: ConflictDoc, picks: Pick[]) => join(doc, resultLayout(doc, picks).lines.map((l) => l.text))

/** Só para "Gravar com marcadores": trecho sem escolha vira os marcadores do git. */
export function outputWithMarkers(doc: ConflictDoc, picks: Pick[]): string {
  const lines: string[] = []
  let n = 0
  for (const s of doc.segments) {
    if (s.kind === 'text') { lines.push(...s.lines); continue }
    const p = picks[n++]!
    if (p.touched) lines.push(...p.order.map((t) => s[t.side][t.i]!))
    else lines.push('<<<<<<< Atual', ...s.ours, '=======', ...s.theirs, '>>>>>>> Entrando')
  }
  return join(doc, lines)
}

/** Linha de um lado; `n` é o número dela no arquivo daquele lado, `i` o índice dentro do trecho. */
export interface Cell { text: string; n: number; i: number | null }
/** Uma linha de A | B. Os trechos são preenchidos (`null`) até o lado maior, então as linhas comuns ficam alinhadas. */
export interface PaneRow { chunk: number | null; first: boolean; ours: Cell | null; theirs: Cell | null }

export function paneRows(doc: ConflictDoc): PaneRow[] {
  const rows: PaneRow[] = []
  let [a, b, n] = [0, 0, 0]
  for (const s of doc.segments) {
    if (s.kind === 'text') {
      for (const text of s.lines) rows.push({ chunk: null, first: false, ours: { text, n: ++a, i: null }, theirs: { text, n: ++b, i: null } })
      continue
    }
    for (let r = 0; r < Math.max(s.ours.length, s.theirs.length); r++) {
      const [o, t] = [s.ours[r], s.theirs[r]]
      rows.push({
        chunk: n, first: r === 0,
        ours: o === undefined ? null : { text: o, n: ++a, i: r },
        theirs: t === undefined ? null : { text: t, n: ++b, i: r },
      })
    }
    n++
  }
  return rows
}

/** Índice da primeira linha de cada trecho, em `paneRows`. */
export const chunkStarts = (rows: PaneRow[]) => rows.flatMap((r, k) => (r.first ? [k] : []))
