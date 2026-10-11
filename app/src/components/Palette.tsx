import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import { actions, selectActiveTab, useApp, type PaletteMode } from '../store/app'

const ROW = 28

interface Item {
  /** Nome da ref: `key` estável da lista virtualizada. */
  name: string
  current: boolean
  pick: () => void
}

const PLACEHOLDER: Record<PaletteMode, string> = {
  checkout: 'Checkout de branch…',
  deleteRemote: 'Excluir branch remota…',
  createBranch: 'Nome da nova branch…',
}

function load(mode: PaletteMode, path: string): Promise<Item[]> {
  if (mode === 'createBranch') return Promise.resolve([])
  if (mode === 'checkout')
    return core.listBranches(path).then((bs) =>
      bs.map((b) => ({
        name: b.name,
        current: b.current,
        pick: () => {
          if (!b.current) void actions.execute(path, { type: 'checkout', target: b.name })
        },
      })),
    )
  return core.listRemoteBranches(path).then((bs) =>
    bs.map((b) => ({ name: `${b.remote}/${b.name}`, current: false, pick: () => actions.requestDeleteRemote(path, b.remote, b.name) })),
  )
}

/** Paleta: checkout de branch local (Ctrl+P) ou escolha da branch remota a excluir. */
export function Palette({ mode }: { mode: PaletteMode }) {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const [items, setItems] = useState<Item[]>([])
  const [query, setQuery] = useState('')
  const [cursor, setCursor] = useState(0)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (path) void load(mode, path).then(setItems, () => setItems([]))
  }, [mode, path])

  const q = query.trim().toLowerCase()
  const shown = q ? items.filter((b) => b.name.toLowerCase().includes(q)) : items

  const virtual = useVirtualizer({ count: shown.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 8 })

  useEffect(() => {
    virtual.scrollToIndex(cursor) // a seleção por teclado acompanha a lista virtualizada
  }, [cursor, virtual])

  const close = () => actions.setPalette(null)
  const choose = (b: Item | undefined) => {
    if (!b) return
    close()
    b.pick()
  }
  const createBranch = () => {
    if (!path || !query.trim()) return
    close()
    void actions.execute(path, { type: 'branchCreate', name: query.trim(), start: null, checkout: true })
  }

  return (
    <div className="overlay" onMouseDown={close}>
      <div className="palette" role="dialog" aria-label={PLACEHOLDER[mode]} onMouseDown={(e) => e.stopPropagation()}>
        <input
          autoFocus
          placeholder={PLACEHOLDER[mode]}
          value={query}
          onChange={(e) => {
            setQuery(e.target.value)
            setCursor(0)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') close()
            else if (e.key === 'ArrowDown') setCursor((c) => Math.min(c + 1, shown.length - 1))
            else if (e.key === 'ArrowUp') setCursor((c) => Math.max(c - 1, 0))
            else if (e.key === 'Enter') mode === 'createBranch' ? createBranch() : choose(shown[cursor])
          }}
        />
        {mode === 'createBranch' && <button onClick={createBranch} disabled={!query.trim()}>Criar branch e fazer checkout</button>}
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
