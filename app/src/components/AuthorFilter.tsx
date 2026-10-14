import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { AuthorInfo } from '../bridge/types'
import { actions, useApp } from '../store/app'
import { Avatar } from './avatar'
import { placeMenu, type Rect } from './menuModel'

const ROW = 44
const NONE: string[] = []

/** Overlay do filtro da coluna Autor: todos os Autores do repositório, vários marcáveis. Clicar não fecha. */
export function AuthorFilter({ path, anchor, onClose }: { path: string; anchor: Rect; onClose: () => void }) {
  const selected = useApp((s) => s.tabs.find((t) => t.path === path)?.authors ?? NONE)
  const [authors, setAuthors] = useState<AuthorInfo[] | null>(null)
  const [query, setQuery] = useState('')
  const box = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void core.listAuthors(path).then((list) => {
      if (!active) return
      setAuthors(list)
      // Autor marcado que sumiu do histórico (reset, por exemplo) sai do filtro.
      const emails = new Set(list.map((a) => a.email.toLowerCase()))
      const current = useApp.getState().tabs.find((t) => t.path === path)?.authors ?? NONE
      const kept = current.filter((e) => emails.has(e))
      if (kept.length !== current.length) actions.setAuthorFilter(path, kept)
    }, (err) => { if (active) actions.reportError(err) })
    return () => { active = false }
  }, [path])
  useLayoutEffect(() => {
    const el = box.current!
    const { left, top } = placeMenu(anchor, el.offsetWidth, el.offsetHeight, 'below', innerWidth, innerHeight)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [anchor, authors])

  const needle = query.trim().toLocaleLowerCase()
  const shown = (authors ?? []).filter((a) => !needle || `${a.name}\n${a.email}`.toLocaleLowerCase().includes(needle))
  const virtual = useVirtualizer({ count: shown.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 8,
    getItemKey: (i) => shown[i]!.email.toLowerCase() })
  const toggle = (email: string) => {
    const key = email.toLowerCase()
    actions.setAuthorFilter(path, selected.includes(key) ? selected.filter((e) => e !== key) : [...selected, key])
  }

  return <div className="menu-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={box} className="author-filter" role="dialog" aria-label="Filtrar por autor" onKeyDown={(e) => { if (e.key === 'Escape') onClose() }}>
      <input autoFocus value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar autor…" aria-label="Buscar autor" />
      <div ref={scroller} className="author-list">
        {!authors && <div className="author-empty" role="status">Carregando autores…</div>}
        {authors && !shown.length && <div className="author-empty">Nenhum autor encontrado.</div>}
        <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
          {virtual.getVirtualItems().map((item) => {
            const a = shown[item.index]!
            const checked = selected.includes(a.email.toLowerCase())
            return <button key={item.key} className="author-row" role="checkbox" aria-checked={checked} title={a.email}
              style={{ height: ROW, transform: `translateY(${item.start}px)` }} onClick={() => toggle(a.email)}>
              <Avatar name={a.name} email={a.email} checked={checked} />
              <span className="author-text"><span>{a.name}</span><span className="muted">{a.email}</span></span>
            </button>
          })}
        </div>
      </div>
      {selected.length > 0 && <button className="author-clear" onClick={() => actions.setAuthorFilter(path, [])}>Limpar</button>}
    </div>
  </div>
}
