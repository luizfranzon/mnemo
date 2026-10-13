// Colunas do grafo (docs/02-comportamentos.md § Colunas do grafo). Larguras, ordem, visibilidade e modo compacto
// ficam nos dados do app (localStorage do Electron), por diretório de trabalho (ADR 0005).
export type ColId = 'refs' | 'graph' | 'message' | 'description' | 'author' | 'date' | 'sha'

/** `message` é a coluna flexível; `graph` e `message` nunca somem. */
export const COLUMNS: Record<ColId, { label: string; def: number; min: number; hideable: boolean }> = {
  refs: { label: 'Branch / Tag', def: 150, min: 70, hideable: true },
  graph: { label: 'Grafo', def: 144, min: 56, hideable: false },
  message: { label: 'Mensagem', def: 0, min: 200, hideable: false },
  description: { label: 'Descrição', def: 220, min: 80, hideable: true },
  author: { label: 'Autor', def: 120, min: 60, hideable: true },
  date: { label: 'Data', def: 104, min: 70, hideable: true },
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
export const columnWidth = (l: GraphLayout, id: ColId) => Math.max(COLUMNS[id].min, l.widths[id] ?? COLUMNS[id].def)

/** Larguras são preferidas: com pouco espaço as colunas encolhem até o mínimo antes de a Mensagem passar de 200px.
 * `override`: largura provisória de uma coluna durante o arrasto. */
export function gridTemplate(l: GraphLayout, override?: { id: ColId; width: number }) {
  return visibleColumns(l)
    .map((id) => (id === 'message' ? `minmax(${COLUMNS.message.min}px, 1fr)` : `minmax(${COLUMNS[id].min}px, ${override?.id === id ? override.width : columnWidth(l, id)}px)`))
    .join(' ')
}

/** Largura do arrasto: o que sobra para a Mensagem nunca fica abaixo do mínimo. `room` = largura total da grade. */
export function dragColumnWidth(l: GraphLayout, id: ColId, raw: number, room: number) {
  const others = visibleColumns(l).reduce((sum, c) => sum + (c === id || c === 'message' ? 0 : columnWidth(l, c)), 0)
  const { min } = COLUMNS[id]
  return Math.round(Math.max(min, Math.min(raw, room - others - COLUMNS.message.min)))
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
export const geometry = (compact: boolean) => (compact ? { lane: 10, first: 8 } : { lane: 16, first: 12 })
