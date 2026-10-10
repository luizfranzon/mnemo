import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useMemo, useRef, useState } from 'react'
import { core } from '../bridge'
import type { BranchInfo } from '../bridge/types'
import { actions, selectActiveTab, useApp } from '../store/app'

const ROW = 28

/** Paleta (Ctrl+P): checkout de branch local. Lista virtualizada, com `key` estável (nome da ref). */
export function Palette() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const [branches, setBranches] = useState<BranchInfo[]>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (path) void core.listBranches(path).then(setBranches, () => setBranches([]))
  }, [path])

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase()
    return q ? branches.filter((b) => b.name.toLowerCase().includes(q)) : branches
  }, [branches, query])

  const virtual = useVirtualizer({ count: shown.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 8 })

  const close = () => actions.setPalette(false)
  const choose = (b: BranchInfo | undefined) => {
    if (!b || !path) return
    close()
    if (!b.current) void actions.execute(path, { type: 'checkout', target: b.name })
  }

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label="Checkout de branch" onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder="Checkout de branch…"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, shown.length - 1))
            else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
            else if (e.key === 'Enter') choose(shown[cursor])
          }}
        />
        <div className="palette-list" ref={scroller}>
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            {virtual.getVirtualItems().map((row) => {
              const b = shown[row.index]
              if (!b) return null
              return (
                <button
                  key={b.name}
                  className={row.index === cursor ? 'palette-row selected' : 'palette-row'}
                  style={{ position: 'absolute', top: 0, left: 0, width: '100%', height: ROW, transform: `translateY(${row.start}px)` }}
                  onMouseEnter={() => setCursor(row.index)}
                  onClick={() => choose(b)}
                >
                  <span>{b.name}</span>
                  {b.current && <span className="muted">atual</span>}
                </button>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
