import type { PointerEvent } from 'react'

/** Lado a lado: o arrasto seleciona só o lado onde começou (o CSS desliga o outro por `data-sel`). */
export function selectSide(e: PointerEvent<HTMLElement>) {
  const half = (e.target as HTMLElement).closest('.diff-half, .conflict-half')
  if (half) e.currentTarget.dataset.sel = half.classList.contains('left') || half.classList.contains('ours') ? 'left' : 'right'
  else delete e.currentTarget.dataset.sel
}
