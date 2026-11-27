import { useLayoutEffect, useRef, type KeyboardEvent, type ReactNode } from 'react'
import { placeMenu, type Rect } from './menuModel'

interface Props {
  anchor: Rect
  label: string
  onClose: () => void
  onKeyDown?: (event: KeyboardEvent<HTMLDivElement>) => void
  children: ReactNode
}

export function Popover({ anchor, label, onClose, onKeyDown, children }: Props) {
  const box = useRef<HTMLDivElement>(null)
  useLayoutEffect(() => {
    const el = box.current!
    const { left, top } = placeMenu(anchor, el.offsetWidth, el.offsetHeight, 'below', innerWidth, innerHeight)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  })
  const keys = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Escape') onClose()
    onKeyDown?.(event)
  }
  return <div className="menu-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={box} className="author-filter" role="dialog" aria-label={label} onKeyDown={keys}>{children}</div>
  </div>
}
