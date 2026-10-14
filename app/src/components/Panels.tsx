import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { dragWidth, loadLayout, PANEL, RAIL, saveLayout, type Layout, type Side } from './panelLayout'
import { CommitPanel } from './CommitPanel'
import { WipPanel } from './WipPanel'
import { selectDiff, useApp } from '../store/app'
import { DiffView } from './DiffView'
import { RefPanel } from './RefPanel'
import { TOGGLE_PANEL } from './windowMenus'

/** Refs · centro · painel direito. Montado por Aba (`key` = caminho): cada repo lembra suas larguras. */
export function Panels({ path, children }: { path: string; children: ReactNode }) {
  const [layout, setLayout] = useState(() => loadLayout(path))
  const root = useRef<HTMLDivElement>(null)
  const wip = useApp((s) => s.selectedSha === 'wip')
  // com o diff aberto o painel de refs vira rail sem mexer no layout salvo; expandir vale até o diff fechar
  const diffOpen = useApp((s) => selectDiff(path)(s) !== null)
  const [peek, setPeek] = useState(false)
  useEffect(() => { if (!diffOpen) setPeek(false) }, [diffOpen])
  const leftOpen = diffOpen ? peek : layout.leftOpen

  const update = (fn: (l: Layout) => Layout) =>
    setLayout((l) => {
      const next = fn(l)
      saveLayout(path, next)
      return next
    })

  useEffect(() => {
    const onToggle = (e: Event) => {
      if ((e as CustomEvent<Side>).detail === 'left') update((l) => ({ ...l, leftOpen: !l.leftOpen }))
      else update((l) => ({ ...l, rightOpen: !l.rightOpen }))
    }
    window.addEventListener(TOGGLE_PANEL, onToggle)
    return () => window.removeEventListener(TOGGLE_PANEL, onToggle)
  }, [])

  // reaplica a cada render: o arrasto escreveu direto no DOM, e o React não sabe disso
  useLayoutEffect(() => {
    root.current?.style.setProperty('--left-w', `${leftOpen ? layout.left : RAIL}px`)
    root.current?.style.setProperty('--right-w', `${layout.right}px`)
  })

  return (
    <div className="panels" ref={root}>
      <aside className={leftOpen ? 'panel panel-left' : 'panel panel-left rail'} aria-label="Refs">
        <RefPanel path={path} rail={!leftOpen} expand={() => (diffOpen ? setPeek(true) : update((l) => ({ ...l, leftOpen: true })))}
          collapse={() => (diffOpen ? setPeek(false) : update((l) => ({ ...l, leftOpen: false })))} />
        <Divider side="left" layout={layout} root={root} update={update} />
      </aside>
      <main className="panel-center">{children}{diffOpen && <DiffView path={path} />}</main>
      {layout.rightOpen && (
        <aside className="panel panel-right" aria-label="Detalhes">
          <Divider side="right" layout={layout} root={root} update={update} />
          {wip ? <WipPanel path={path} /> : <CommitPanel path={path} />}
        </aside>
      )}
    </div>
  )
}

interface DividerProps {
  side: Side
  layout: Layout
  root: RefObject<HTMLDivElement | null>
  update: (fn: (l: Layout) => Layout) => void
}

/** Arrasto a 60fps só mexe na CSS variable; o estado (e o disco) muda ao soltar. */
function Divider({ side, layout, root, update }: DividerProps) {
  const open = side === 'left' ? 'leftOpen' : 'rightOpen'

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current
    if (!box || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')
    const rect = box.getBoundingClientRect()
    // em gaveta (janela estreita) o direito fica por cima do centro: não ocupa espaço. Mesma quebra do styles.css.
    const drawer = matchMedia('(max-width: 1099px)').matches
    const other = side === 'left' ? (layout.rightOpen && !drawer ? layout.right : 0) : layout.leftOpen ? layout.left : RAIL
    let width: number | null = layout[open] ? layout[side] : null

    const onMove = (ev: PointerEvent) => {
      const raw = side === 'left' ? ev.clientX - rect.left : rect.right - ev.clientX
      width = dragWidth(side, raw, drawer && side === 'right' ? rect.width : rect.width - other)
      box.style.setProperty(`--${side}-w`, `${width ?? (side === 'left' ? RAIL : 0)}px`)
    }
    const onUp = () => {
      handle.removeEventListener('pointermove', onMove)
      handle.classList.remove('dragging')
      update((l) => ({ ...l, [side]: width ?? l[side], [open]: width !== null }))
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('lostpointercapture', onUp, { once: true })
  }

  return (
    <div
      className="divider"
      role="separator"
      aria-orientation="vertical"
      aria-label={side === 'left' ? 'Redimensionar painel de refs (Ctrl+J recolhe)' : 'Redimensionar painel direito (Ctrl+K recolhe)'}
      onPointerDown={onPointerDown}
      onDoubleClick={() => update((l) => ({ ...l, [side]: PANEL[side].def, [open]: true }))}
    />
  )
}
