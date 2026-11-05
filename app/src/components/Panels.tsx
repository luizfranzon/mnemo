import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode, type RefObject } from 'react'
import { dragWidth, loadLayout, PANEL, RAIL, saveLayout, type Layout, type Side } from './panelLayout'
import { CommitPanel } from './CommitPanel'
import { WipPanel } from './WipPanel'
import { isActiveTab, selectConflict, selectDiff, selectReview, selectSha, useApp } from '../store/app'
import { RefPanel } from './RefPanel'
import { ReviewPanel } from './ReviewPanel'
import { TOGGLE_PANEL } from './windowMenus'

// diff e conflito trazem o CodeMirror e os parsers de linguagem: só carregam ao abrir o primeiro
const DiffView = lazy(() => import('./DiffView').then((m) => ({ default: m.DiffView })))
const ConflictEditor = lazy(() => import('./ConflictEditor').then((m) => ({ default: m.ConflictEditor })))

/** Refs · centro · painel direito. Uma instância por Aba (`key` = caminho), todas montadas: cada repo lembra suas larguras. */
export function Panels({ path, children }: { path: string; children: ReactNode }) {
  const [layout, setLayout] = useState(() => loadLayout(path))
  const root = useRef<HTMLDivElement>(null)
  const wip = useApp((s) => selectSha(path)(s) === 'wip')
  // com o diff aberto o painel de refs vira rail sem mexer no layout salvo; expandir vale até o diff fechar
  const conflictOpen = useApp((s) => selectConflict(path)(s) !== null)
  const reviewing = useApp((s) => selectReview(path)(s) !== undefined)
  const diffOpen = useApp((s) => selectDiff(path)(s) !== null) || conflictOpen || reviewing
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
      if (!isActiveTab(path)) return
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
      <main className="panel-center">{children}<Suspense>{conflictOpen ? <ConflictEditor path={path} /> : diffOpen && <DiffView path={path} />}</Suspense>
        {reviewing && <ReviewIdle path={path} />}</main>
      {(layout.rightOpen || reviewing) && (
        <aside className="panel panel-right" aria-label={reviewing ? 'Revisão' : 'Detalhes'}>
          <Divider side="right" layout={layout} root={root} update={update} />
          {reviewing ? <ReviewPanel path={path} /> : wip ? <WipPanel path={path} /> : <CommitPanel path={path} />}
        </aside>
      )}
    </div>
  )
}

/** Centro da Revisão sem arquivo aberto: cobre o grafo e diz o que fazer. */
function ReviewIdle({ path }: { path: string }) {
  const empty = useApp((s) => selectDiff(path)(s) === null)
  const files = useApp((s) => selectReview(path)(s)?.state.files.length ?? 0)
  if (!empty) return null
  return <div className="diff-view review-idle"><p className="muted">{files ? 'Escolha um arquivo na lista ao lado.' : 'Nenhum arquivo para revisar nesta rodada.'}</p></div>
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
