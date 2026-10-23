import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { EncodingInfo } from '../bridge/types'
import { actions } from '../store/app'
import { placeMenu, type Rect } from './menuModel'
import { Icon } from './Icon'

let cache: EncodingInfo[] | null = null

/** Painel de codificação do diff (mesmo desenho do filtro de Autor): busca, grupos, setas/Enter/Esc. `value`: id escolhido (`guess` = Adivinhar). */
export function EncodingPicker({ path, anchor, value, onPick, onClose }: { path: string; anchor: Rect; value: string; onPick: (id: string) => void; onClose: () => void }) {
  const [list, setList] = useState<EncodingInfo[] | null>(cache)
  const [query, setQuery] = useState('')
  const [active, setActive] = useState(0)
  const box = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (cache) return
    let live = true
    void core.listEncodings(path).then((next) => { cache = next; if (live) setList(next) }, (err) => { if (live) actions.reportError(err, path) })
    return () => { live = false }
  }, [path])
  useLayoutEffect(() => {
    const el = box.current!
    const { left, top } = placeMenu(anchor, el.offsetWidth, el.offsetHeight, 'below', innerWidth, innerHeight)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
  }, [anchor, list, query])
  useEffect(() => { scroller.current?.querySelector('.active')?.scrollIntoView({ block: 'nearest' }) }, [active])

  const needle = query.trim().toLocaleLowerCase()
  const shown = (list ?? []).filter((e) => !needle || `${e.label} ${e.id}`.toLocaleLowerCase().includes(needle))
  const key = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(0, Math.min(shown.length - 1, i + (e.key === 'ArrowDown' ? 1 : -1))))
    } else if (e.key === 'Enter' && shown[active]) { onPick(shown[active]!.id); onClose() }
  }

  return <div className="menu-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose() }}>
    <div ref={box} className="author-filter" role="dialog" aria-label="Codificação do arquivo" onKeyDown={key}>
      <input autoFocus value={query} onChange={(e) => { setQuery(e.target.value); setActive(0) }} placeholder="Buscar codificação…" aria-label="Buscar codificação" />
      <div ref={scroller} className="author-list" role="listbox">
        {!list && <div className="author-empty" role="status">Carregando…</div>}
        {list && !shown.length && <div className="author-empty">Nenhuma codificação encontrada.</div>}
        {shown.map((e, i) => <div key={e.id}>
          {e.group && e.group !== shown[i - 1]?.group && <div className="enc-group">{e.group}</div>}
          <button className={`enc-row${i === active ? ' active' : ''}`} role="option" aria-selected={e.id === value}
            onMouseEnter={() => setActive(i)} onClick={() => { onPick(e.id); onClose() }}>
            <span className="enc-check">{e.id === value && <Icon name="check" size={12} />}</span>{e.label}</button>
        </div>)}
      </div>
    </div>
  </div>
}
