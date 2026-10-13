import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useLayoutEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { core } from '../bridge'
import type { GraphCommit, GraphPage, GraphSegment } from '../bridge/types'
import { actions, useApp } from '../store/app'
import { avatarStyle, initials } from './avatar'
import { commitMenu, type CommitDialog } from './commitMenu'
import { CommitDialogs } from './CommitDialogs'
import { Menu } from './Menu'
import { copyText, menuBase } from './menuBase'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import {
  COLUMNS, DEFAULT_LAYOUT, columnWidth, dragColumnWidth, geometry, gridTemplate, loadGraphLayout, moveColumn, saveGraphLayout, visibleColumns,
  type ColId, type GraphLayout,
} from './graphColumns'

const ROW = 28
const PAGE = 2000
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })
type Geo = ReturnType<typeof geometry>

function pathOf(segment: GraphSegment, { lane, first }: Geo): string {
  const from = first + segment.fromLane * lane
  const to = first + segment.toLane * lane
  if (segment.kind === 'pass') return `M${from} 0 V${ROW}`
  if (segment.kind === 'incoming') return from === to ? `M${from} 0 V14` : `M${from} 0 Q${from} 14 ${to} 14`
  return from === to ? `M${from} 14 V${ROW}` : `M${from} 14 Q${to} 14 ${to} ${ROW}`
}

function CommitSvg({ row, width, geo, compact }: { row: GraphCommit; width: number; geo: Geo; compact: boolean }) {
  const x = geo.first + row.lane * geo.lane
  return <svg width={width} height={ROW} viewBox={`0 0 ${width} ${ROW}`} aria-label={`Grafo de ${row.sha.slice(0, 7)}`}>
    {row.refs.length > 0 && <path d={`M0 14 H${x}`} stroke={row.color} strokeOpacity="0.55" strokeWidth="1" />}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.fromLane}:${segment.toLane}:${index}`}
      d={pathOf(segment, geo)} fill="none" stroke={segment.color} strokeWidth="2" />)}
    {row.head && <circle cx={x} cy="14" r={compact ? 8 : 12} fill="none" stroke="#5b8def" strokeWidth="2" />}
    {compact
      ? row.parents.length > 1
        ? <circle cx={x} cy="14" r="4" fill="none" stroke={row.color} strokeWidth="2" />
        : <circle cx={x} cy="14" r="5" fill={row.color} />
      : <>
        <circle cx={x} cy="14" r="10" fill="var(--surface-2)" stroke={row.color} strokeWidth="2" />
        {row.parents.length > 1
          ? <circle cx={x} cy="14" r="4" fill="none" stroke={row.color} strokeWidth="2" />
          : <text x={x} y="17" textAnchor="middle" fill="var(--text)" fontSize="7" fontWeight="600">{initials(row.author)}</text>}
      </>}
  </svg>
}

function Pills({ refs }: { refs: GraphCommit['refs'] }) {
  if (!refs.length) return null
  return <div className="graph-pills">
    {refs.slice(0, 2).map((ref) => <span key={`${ref.kind}:${ref.name}`} className={`graph-pill ${ref.kind}`} title={ref.name}>
      {ref.current ? '✓ ' : ref.kind === 'remote' ? '☁ ' : ref.kind === 'tag' ? '◇ ' : '⑂ '}{ref.name}
    </span>)}
    {refs.length > 2 && <span className="graph-pill-more" title={refs.slice(2).map((ref) => ref.name).join('\n')}>+{refs.length - 2}</span>}
  </div>
}

export function Graph({ path }: { path: string }) {
  const [page, setPage] = useState<GraphPage | null>(null)
  const [layout, setLayout] = useState(() => loadGraphLayout(path))
  const [gear, setGear] = useState(false)
  const [maxLanes, setMaxLanes] = useState(1)
  const [loading, setLoading] = useState(false)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<CommitDialog | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const pageRef = useRef<GraphPage | null>(null)
  const lastSelection = useRef<string | null>(null)
  const pendingSelection = useRef<string | null>(null)
  const selectedSha = useApp((s) => s.selectedSha)
  const revision = useApp((s) => s.graphRevision[path.replace(/\\/g, '/').toLowerCase()] ?? s.graphRevision[path.replace(/\\/g, '/')] ?? 0)
  const head = useApp((s) => s.tabs.find((t) => t.path === path)?.head)

  const geo = geometry(layout.compact)
  const contentWidth = geo.first * 2 + maxLanes * geo.lane
  const cols = visibleColumns(layout)
  const update = (fn: (l: GraphLayout) => GraphLayout) => setLayout((l) => {
    const next = fn(l)
    saveGraphLayout(path, next)
    return next
  })
  // reaplica a cada render: o arrasto escreveu direto no DOM, e o React não sabe disso
  useLayoutEffect(() => { root.current?.style.setProperty('--graph-cols', gridTemplate(layout)) })

  useEffect(() => {
    const current = ++generation.current
    busy.current = true
    pageRef.current = null
    setPage(null)
    setMaxLanes(1)
    setLoading(true)
    void core.graphPage(path, null, PAGE).then((next) => {
      if (generation.current !== current) return
      pageRef.current = next
      setPage(next)
      setMaxLanes(Math.max(1, ...next.commits.map((commit) => commit.laneCount)))
      if (!useApp.getState().selectedSha && next.commits[0]) actions.selectCommit(next.commits[0].sha)
    }, (err) => { if (generation.current === current) actions.reportError(err) }).finally(() => {
      if (generation.current === current) { busy.current = false; setLoading(false) }
    })
    return () => { generation.current++ }
  }, [path, revision])

  const loadMore = () => {
    const currentPage = pageRef.current
    if (!currentPage?.next || busy.current) return
    busy.current = true
    setLoading(true)
    const current = generation.current
    void core.graphPage(path, currentPage.next, PAGE).then((next) => {
      if (generation.current !== current) return
      const merged = { commits: [...currentPage.commits, ...next.commits], next: next.next, wip: next.wip }
      pageRef.current = merged
      setPage(merged)
      setMaxLanes((lanes) => Math.max(lanes, ...next.commits.map((commit) => commit.laneCount)))
    }, (err) => { if (generation.current === current) actions.reportError(err) }).finally(() => {
      if (generation.current === current) { busy.current = false; setLoading(false) }
    })
  }
  const commits = page?.commits ?? []
  const virtual = useVirtualizer({ count: commits.length + 1, getScrollElement: () => scroller.current,
    estimateSize: () => ROW, overscan: 12, getItemKey: (index) => index === 0 ? `wip:${path}` : commits[index - 1]!.sha })
  useEffect(() => {
    if (!selectedSha || !page) return
    if (selectedSha !== lastSelection.current) {
      lastSelection.current = selectedSha
      pendingSelection.current = selectedSha
    }
    const target = pendingSelection.current
    if (!target) return
    if (target === 'wip') { virtual.scrollToIndex(0); pendingSelection.current = null; return }
    const index = page.commits.findIndex((commit) => commit.sha === target)
    if (index >= 0) { virtual.scrollToIndex(index + 1, { align: 'center' }); pendingSelection.current = null }
    else if (page.next) loadMore()
    else pendingSelection.current = null
  }, [selectedSha, page])

  /** Largura útil da grade: sem a barra de rolagem da lista (10px). */
  const room = () => (root.current?.clientWidth ?? 0) - 10
  const resize = (id: ColId, e: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current
    if (!box || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')
    const start = columnWidth(layout, id)
    const startX = e.clientX
    const sign = cols.indexOf(id) < cols.indexOf('message') ? 1 : -1 // à direita da Mensagem, arrastar para a esquerda alarga
    let width = start
    const onMove = (ev: PointerEvent) => {
      width = dragColumnWidth(layout, id, start + sign * (ev.clientX - startX), room())
      box.style.setProperty('--graph-cols', gridTemplate(layout, { id, width }))
    }
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('lostpointercapture', () => {
      handle.removeEventListener('pointermove', onMove)
      handle.classList.remove('dragging')
      update((l) => ({ ...l, widths: { ...l.widths, [id]: width } }))
    }, { once: true })
  }
  /** Duplo clique no divisor: largura do maior conteúdo carregado (limitada pelo espaço e pelo mínimo). */
  const fit = (id: ColId) => {
    const probe = root.current?.querySelector('.graph-row') ?? root.current
    if (!probe) return
    const style = getComputedStyle(probe)
    const ctx = document.createElement('canvas').getContext('2d')
    if (!ctx) return
    ctx.font = `${style.fontSize} ${style.fontFamily}`
    const text = (c: GraphCommit) => id === 'refs' ? c.refs.slice(0, 2).map((r) => r.name).join('   ')
      : id === 'description' ? c.description : id === 'author' ? c.author : id === 'date' ? date.format(new Date(c.timestamp * 1000)) : c.sha.slice(0, 7)
    const extra = id === 'refs' ? 44 : id === 'author' && layout.compact ? 36 : 16
    const wanted = id === 'graph' ? contentWidth : Math.max(0, ...commits.map((c) => ctx.measureText(text(c)).width)) + extra
    update((l) => ({ ...l, widths: { ...l.widths, [id]: dragColumnWidth(l, id, Math.ceil(wanted), room()) } }))
  }

  useEffect(() => {
    const copy = (e: KeyboardEvent) => {
      if (!selectedSha || selectedSha === 'wip' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!matchesShortcut('Ctrl+Shift+C', e)) return
      e.preventDefault()
      copyText(selectedSha)
    }
    window.addEventListener('keydown', copy)
    return () => window.removeEventListener('keydown', copy)
  }, [selectedSha])
  const openMenu = async (commit: GraphCommit, e: React.MouseEvent) => {
    e.preventDefault()
    actions.selectCommit(commit.sha)
    const anchor = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
    const base = await menuBase(path)
    if (!base) return
    setMenu({ anchor, items: commitMenu(commit, {
      ...base, dialog: setDialog, execute: (kind) => void actions.execute(path, kind),
      checkout: (sha) => void actions.checkoutRef(path, { type: 'checkout', target: sha }),
      newBranch: (start) => actions.setPalette('createBranch', start), resetHard: (sha) => void actions.requestResetHard(path, sha),
    }) })
  }

  const branch = head?.kind === 'branch' ? head.name : head?.sha ?? 'HEAD'
  const cell = (id: ColId, commit: GraphCommit | null | undefined, wip: boolean) => {
    switch (id) {
      case 'refs': return <div key={id} className="graph-refs">{commit && <Pills refs={commit.refs} />}{commit && commit.refs.length > 0 &&
        <span className="graph-ref-connector" style={{ borderColor: commit.color }} />}</div>
      case 'graph': return <div key={id} className="graph-cell">
        <div className="graph-canvas" style={{ width: contentWidth }}>
          {commit ? <CommitSvg row={commit} width={contentWidth} geo={geo} compact={layout.compact} /> : <svg width={contentWidth} height={ROW}>
            <circle cx={geo.first} cy="14" r={layout.compact ? 5 : 10} fill="var(--surface-2)" stroke="#9c9992" strokeWidth="2" strokeDasharray="3 3" />
          </svg>}
        </div>
      </div>
      case 'message': return <span key={id} className="graph-message">{wip ? `// WIP  ✎${page?.wip.changed ?? 0} +${page?.wip.untracked ?? 0}` : commit?.subject}</span>
      case 'description': return <span key={id} className="graph-description" title={commit?.description}>{commit?.description}</span>
      case 'author': return <span key={id} className="graph-author" title={commit?.email}>
        {commit && layout.compact && <span className="avatar small" style={avatarStyle(commit.email)}>{initials(commit.author)}</span>}{commit?.author}</span>
      case 'date': return <span key={id}>{commit ? date.format(new Date(commit.timestamp * 1000)) : ''}</span>
      case 'sha': return <span key={id} className="graph-sha" title={commit?.sha}>{commit?.sha.slice(0, 7)}</span>
    }
  }
  return <div className="graph-view" ref={root}>
    <div className="graph-meta"><span>Histórico</span><strong data-testid="current-branch">{branch}</strong>
      <button className="graph-gear" aria-label="Colunas do grafo" title="Colunas do grafo" aria-expanded={gear} onClick={() => setGear(!gear)}>⚙</button></div>
    {gear && <>
      <div className="graph-pop-overlay" onMouseDown={() => setGear(false)} />
      <div className="graph-pop" role="dialog" aria-label="Colunas do grafo" onKeyDown={(e) => { if (e.key === 'Escape') setGear(false) }}>
        {layout.order.map((id, i) => <div key={id} className="graph-pop-row">
          <label><input type="checkbox" checked={!layout.hidden.includes(id)} disabled={!COLUMNS[id].hideable}
            onChange={(e) => update((l) => ({ ...l, hidden: e.target.checked ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] }))} /> {COLUMNS[id].label}</label>
          <button aria-label={`Subir ${COLUMNS[id].label}`} disabled={i === 0} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, -1) }))}>▲</button>
          <button aria-label={`Descer ${COLUMNS[id].label}`} disabled={i === layout.order.length - 1} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, 1) }))}>▼</button>
        </div>)}
        <label className="graph-pop-row"><input type="checkbox" checked={layout.compact} onChange={(e) => update((l) => ({ ...l, compact: e.target.checked }))} /> Layout compacto</label>
        <button className="graph-pop-reset" onClick={() => update(() => DEFAULT_LAYOUT)}>Restaurar padrão</button>
      </div>
    </>}
    <div className="graph-header graph-grid">
      {cols.map((id) => <div key={id} className="graph-hcell">
        {id === 'graph'
          ? <div className="graph-scrollbar" onScroll={(e) => root.current?.style.setProperty('--graph-offset', `${-e.currentTarget.scrollLeft}px`)}>
            <span>Grafo</span><div style={{ width: contentWidth, height: 1 }} />
          </div>
          : <span>{COLUMNS[id].label}</span>}
        {id !== 'message' && <div className={`col-handle ${cols.indexOf(id) < cols.indexOf('message') ? 'after' : 'before'}`} role="separator" aria-orientation="vertical"
          aria-label={`Redimensionar ${COLUMNS[id].label}`} onPointerDown={(e) => resize(id, e)} onDoubleClick={() => fit(id)} />}
      </div>)}
    </div>
    <div className="graph-list" ref={scroller} onScroll={(e) => {
      const box = e.currentTarget
      if (box.scrollTop + box.clientHeight > box.scrollHeight - 500) loadMore()
    }}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const commit = item.index ? commits[item.index - 1] : null
          const wip = !item.index
          const selected = commit ? selectedSha === commit.sha : selectedSha === 'wip'
          return <div key={item.key} className={`graph-row graph-grid${selected ? ' selected' : ''}`} style={{ height: ROW, transform: `translateY(${item.start}px)` }}
            onClick={() => actions.selectCommit(commit?.sha ?? 'wip')}
            onContextMenu={(e) => { if (commit) void openMenu(commit, e) }}
            onDoubleClick={() => { if (commit) void actions.checkoutRef(path, { type: 'checkout', target: commit.sha }) }}>
            {cols.map((id) => cell(id, commit, wip))}
          </div>
        })}
      </div>
      {!commits.length && !loading && <div className="graph-empty">Este repositório ainda não tem commits.</div>}
      {loading && <div className="graph-loading" role="status">Carregando commits…</div>}
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu do commit" onClose={() => setMenu(null)} />}
    {dialog && <CommitDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
