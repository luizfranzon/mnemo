import type { ConflictDoc } from '../bridge/types'

/** Linhas escolhidas de um conflito. `touched`: o usuário (ou o auto) já decidiu este trecho. */
export interface Pick { ours: boolean[]; theirs: boolean[]; touched: boolean }

export const conflictsOf = (doc: ConflictDoc) =>
  doc.segments.flatMap((s) => (s.kind === 'conflict' ? [s] : []))

const all = (n: number, on: boolean) => Array.from({ length: n }, () => on)

/** Trecho que só difere em espaço (`auto`) já começa com o Atual escolhido. */
export function initialPicks(doc: ConflictDoc): Pick[] {
  return conflictsOf(doc).map((c) => ({ ours: all(c.ours.length, c.auto), theirs: all(c.theirs.length, false), touched: c.auto }))
}

export const takeSide = (c: { ours: string[]; theirs: string[] }, ours: boolean, theirs: boolean): Pick =>
  ({ ours: all(c.ours.length, ours), theirs: all(c.theirs.length, theirs), touched: true })

export const unresolved = (picks: Pick[]) => picks.filter((p) => !p.touched).length

/** Resultado: texto comum + linhas escolhidas (Atual antes de Entrando). Trecho sem escolha vira marcadores se `markers`. */
export function output(doc: ConflictDoc, picks: Pick[], markers = false): string {
  const lines: string[] = []
  let n = 0
  for (const s of doc.segments) {
    if (s.kind === 'text') { lines.push(...s.lines); continue }
    const p = picks[n++]!
    if (markers && !p.touched) lines.push('<<<<<<< Atual', ...s.ours, '=======', ...s.theirs, '>>>>>>> Entrando')
    else lines.push(...s.ours.filter((_, i) => p.ours[i]), ...s.theirs.filter((_, i) => p.theirs[i]))
  }
  const text = lines.join('\n')
  return doc.finalNewline && lines.length ? `${text}\n` : text
}
