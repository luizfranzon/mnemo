// Modelo do componente de menu único (docs/02-comportamentos.md § Menus de contexto): menus da janela e de contexto.

/** `'-'` = separador. Item com `reason` fica desabilitado e mostra o motivo no tooltip (não some). */
export type MenuEntry =
  | '-'
  | {
      label: string
      shortcut?: string
      reason?: string
      danger?: boolean
      run?: () => void
      submenu?: MenuEntry[]
    }

export interface Rect {
  left: number
  top: number
  right: number
  bottom: number
}

/**
 * Posição do menu `w`×`h` ancorado em `a` dentro da janela `W`×`H`. `below`: abaixo do botão (ou do ponto do
 * clique); `right`: submenu ao lado do item. Sem espaço, vira para cima/esquerda; nunca sai da janela.
 */
export function placeMenu(a: Rect, w: number, h: number, side: 'below' | 'right', W: number, H: number) {
  const [x, flipX, y, flipY] = side === 'below' ? [a.left, a.right, a.bottom, a.top] : [a.right, a.left, a.top, a.bottom]
  return {
    left: x + w <= W ? x : Math.max(0, flipX - w),
    top: y + h <= H ? y : Math.max(0, Math.min(flipY, H) - h),
  }
}

/** `Ctrl+Shift+T`, `Alt+T`, `F11`, `Ctrl+=`: modificadores exatos, tecla sem diferenciar maiúsculas. */
export function matchesShortcut(shortcut: string, e: KeyboardEvent): boolean {
  const parts = shortcut.split('+')
  const key = parts.pop() || '+'
  return (
    e.key.toLowerCase() === key.toLowerCase() &&
    (e.ctrlKey || e.metaKey) === parts.includes('Ctrl') &&
    e.shiftKey === parts.includes('Shift') &&
    e.altKey === parts.includes('Alt')
  )
}
