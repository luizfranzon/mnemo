// Larguras dos painéis laterais (docs/02-comportamentos.md § Painéis). Salvas nos dados do app
// (localStorage do Electron mora em userData), por diretório de trabalho (ADR 0005).
export type Side = 'left' | 'right'

export const PANEL = {
  left: { min: 200, max: 420, def: 264 },
  right: { min: 300, max: 640, def: 380 },
} as const
export const RAIL = 44
const CENTER_MIN = 480
/** Folga abaixo do mínimo antes de recolher: soltar perto do mínimo não some com o painel. */
const SNAP = 40

/** Largura para a posição do arrasto; `null` = recolhe. `room` = largura livre sem o outro painel. */
export function dragWidth(side: Side, raw: number, room: number): number | null {
  const { min, max } = PANEL[side]
  if (raw < min - SNAP) return null
  return Math.max(min, Math.min(max, room - CENTER_MIN, raw))
}

export interface Layout {
  left: number
  right: number
  leftOpen: boolean
  rightOpen: boolean
}

const DEFAULT: Layout = { left: PANEL.left.def, right: PANEL.right.def, leftOpen: true, rightOpen: true }
const key = (path: string) => `mnemo.layout:${path}`

export function loadLayout(path: string): Layout {
  try {
    const l = { ...DEFAULT, ...(JSON.parse(localStorage.getItem(key(path)) ?? '{}') as Partial<Layout>) }
    const clamp = (side: Side) => Math.max(PANEL[side].min, Math.min(PANEL[side].max, Number(l[side]) || PANEL[side].def))
    return { ...l, left: clamp('left'), right: clamp('right') }
  } catch {
    return DEFAULT
  }
}

export function saveLayout(path: string, layout: Layout) {
  try {
    localStorage.setItem(key(path), JSON.stringify(layout))
  } catch {
    /* sem storage: só não lembra */
  }
}
