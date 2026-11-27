// Colunas do grafo (docs/02-comportamentos.md § Colunas do grafo). Larguras, ordem, visibilidade e modo compacto
// ficam nos dados do app (localStorage do Electron), por diretório de trabalho (ADR 0005).
export type ColId = 'refs' | 'graph' | 'message' | 'description' | 'author' | 'date' | 'sha'

/** `message` é a coluna flexível; `graph` e `message` nunca somem. */
export const COLUMNS: Record<ColId, { label: string; def: number; min: number; hideable: boolean }> = {
  refs: { label: 'Branch / Tag', def: 190, min: 70, hideable: true },
  graph: { label: 'Grafo', def: 144, min: 56, hideable: false },
  message: { label: 'Mensagem', def: 0, min: 200, hideable: false },
  description: { label: 'Descrição', def: 220, min: 80, hideable: true },
  author: { label: 'Autor', def: 120, min: 60, hideable: true },
  date: { label: 'Data', def: 150, min: 100, hideable: true },
  sha: { label: 'SHA', def: 70, min: 56, hideable: true },
}
const IDS = Object.keys(COLUMNS) as ColId[]

export interface GraphLayout {
  order: ColId[]
  hidden: ColId[]
  widths: Partial<Record<ColId, number>>
  compact: boolean
}

export const DEFAULT_LAYOUT: GraphLayout = { order: ['refs', 'graph', 'message', 'description', 'author', 'date', 'sha'], hidden: ['description'], widths: {}, compact: false }
const key = (path: string) => `mnemo.graph:${path}`

/** Descarta o que não for válido: ordem tem de conter cada coluna uma vez; graph/message nunca ficam ocultas. */
export function sanitize(raw: Partial<GraphLayout>): GraphLayout {
  const order = Array.isArray(raw.order) && raw.order.length === IDS.length && IDS.every((id) => raw.order!.includes(id)) ? raw.order : DEFAULT_LAYOUT.order
  const hidden = (Array.isArray(raw.hidden) ? raw.hidden : DEFAULT_LAYOUT.hidden).filter((id) => IDS.includes(id) && COLUMNS[id].hideable)
  const widths: GraphLayout['widths'] = {}
  for (const id of IDS) {
    const w = Number(raw.widths?.[id])
    if (id !== 'message' && Number.isFinite(w) && w > 0) widths[id] = Math.max(COLUMNS[id].min, w)
  }
  return { order, hidden, widths, compact: raw.compact === true }
}

export function loadGraphLayout(path: string): GraphLayout {
  try { return sanitize(JSON.parse(localStorage.getItem(key(path)) ?? '{}') as Partial<GraphLayout>) } catch { return DEFAULT_LAYOUT }
}

export function saveGraphLayout(path: string, layout: GraphLayout) {
  try { localStorage.setItem(key(path), JSON.stringify(layout)) } catch { /* sem storage: só não lembra */ }
}

export const visibleColumns = (l: GraphLayout) => l.order.filter((id) => !l.hidden.includes(id))
/** Limites que dependem do conteúdo: `graphMax` = a coluna Grafo nunca passa da largura do conteúdo (onde a faixa da lane
 * termina); `refsMin` = a Branch / Tag nunca fica menor que a maior pill. */
export interface Bounds { graphMax?: number; refsMin?: number }
export const columnMin = (id: ColId, b: Bounds = {}) => (id === 'refs' ? Math.max(COLUMNS.refs.min, b.refsMin ?? 0) : COLUMNS[id].min)
export const columnWidth = (l: GraphLayout, id: ColId, b: Bounds = {}) => {
  const w = l.widths[id] ?? COLUMNS[id].def
  return Math.max(columnMin(id, b), id === 'graph' ? Math.min(w, b.graphMax ?? Infinity) : w)
}

/** Larguras são preferidas: com pouco espaço as colunas encolhem até o mínimo antes de a Mensagem passar de 200px.
 * `override`: largura provisória de uma coluna durante o arrasto. */
export function gridTemplate(l: GraphLayout, override?: { id: ColId; width: number }, b: Bounds = {}) {
  return visibleColumns(l)
    .map((id) => (id === 'message' ? `minmax(${COLUMNS.message.min}px, 1fr)` : `minmax(${columnMin(id, b)}px, ${override?.id === id ? override.width : columnWidth(l, id, b)}px)`))
    .join(' ')
}

/** Largura do arrasto: o que sobra para a Mensagem nunca fica abaixo do mínimo. `room` = largura total da grade. */
export function dragColumnWidth(l: GraphLayout, id: ColId, raw: number, room: number, b: Bounds = {}) {
  const others = visibleColumns(l).reduce((sum, c) => sum + (c === id || c === 'message' ? 0 : columnWidth(l, c, b)), 0)
  const min = columnMin(id, b)
  return Math.round(Math.max(min, Math.min(raw, room - others - COLUMNS.message.min, id === 'graph' ? b.graphMax ?? Infinity : Infinity)))
}

/** Sobe/desce uma coluna na ordem completa. */
export function moveColumn(order: ColId[], id: ColId, dir: -1 | 1): ColId[] {
  const i = order.indexOf(id)
  const j = i + dir
  if (i < 0 || j < 0 || j >= order.length) return order
  const next = [...order]
  ;[next[i], next[j]] = [next[j]!, next[i]!]
  return next
}

/** Geometria do nó: o modo compacto estreita as lanes e troca o avatar por um ponto. */
const COMPACT_GEO = { lane: 14, first: 8 }
const FULL_GEO = { lane: 24, first: 12 }
// objeto fixo por modo: um novo a cada render faria todo CommitSvg desenhar de novo no scroll
export const geometry = (compact: boolean) => (compact ? COMPACT_GEO : FULL_GEO)

/** Altura da linha e y do centro do nó. */
export const ROW = 28
const MID = 14
const RADIUS = 8

/**
 * Traçado de um segmento: sempre vertical + horizontal com um canto de 90° arredondado (raio até 8px).
 * Entrada: desce pela lane de origem e dobra para o nó. Saída: sai do nó na horizontal e desce pela lane do pai.
 */
export function segmentPath(segment: { fromLane: number; toLane: number; kind: 'pass' | 'incoming' | 'parent' }, { lane, first }: { lane: number; first: number }): string {
  const from = first + segment.fromLane * lane
  const to = first + segment.toLane * lane
  if (segment.kind === 'pass') return `M${from} 0 V${ROW}`
  const r = Math.min(Math.abs(to - from), RADIUS)
  const dir = Math.sign(to - from)
  if (segment.kind === 'incoming') return r === 0 ? `M${from} 0 V${MID}` : `M${from} 0 V${MID - r} Q${from} ${MID} ${from + dir * r} ${MID} H${to}`
  return r === 0 ? `M${from} ${MID} V${ROW}` : `M${from} ${MID} H${to - dir * r} Q${to} ${MID} ${to} ${MID + r} V${ROW}`
}
