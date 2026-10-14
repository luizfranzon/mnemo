import { useVirtualizer } from '@tanstack/react-virtual'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { core } from '../bridge'
import type { GraphCommit, GraphPage } from '../bridge/types'
import { actions, useApp } from '../store/app'
import { graphVisibility, selectVisibility, updateVisibility, useVisibility } from '../store/visibility'
import { avatarStyle, initials } from './avatar'
import type { BranchTarget } from './branchMenu'
import { commitMenu, type CommitDialog } from './commitMenu'
import { CommitDialogs } from './CommitDialogs'
import { Menu } from './Menu'
import { useBranchActions } from './useBranchActions'
import { RefIcon } from './RefIcon'
import { copyText, menuBase } from './menuBase'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import {
  COLUMNS, DEFAULT_LAYOUT, ROW, columnWidth, dragColumnWidth, geometry, gridTemplate, loadGraphLayout, moveColumn, saveGraphLayout, segmentPath, visibleColumns,
  type ColId, type GraphLayout,
} from './graphColumns'

const PAGE = 2000
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false })
const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
type Geo = ReturnType<typeof geometry>


function CommitSvg({ row, width, geo, compact }: { row: GraphCommit; width: number; geo: Geo; compact: boolean }) {
  const x = geo.first + row.lane * geo.lane
  return <svg width={width} height={ROW} viewBox={`0 0 ${width} ${ROW}`} aria-label={`Grafo de ${row.sha.slice(0, 7)}`}>
    {row.refs.length > 0 && <path d={`M0 14 H${x}`} stroke={row.color} strokeOpacity="0.55" strokeWidth="1" />}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.fromLane}:${segment.toLane}:${index}`}
      d={segmentPath(segment, geo)} fill="none" stroke={segment.color} strokeWidth="2" />)}
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

type Pill = { key: string; label: string; title: string; kind: 'branch' | 'tag'; local: string | null; remote: string | null; current: boolean }

const rank = (p: Pill) => p.current ? 0 : p.local && p.remote ? 1 : p.local ? 2 : p.remote ? 3 : 4

/** Uma pill por branch: a remota que a local rastreia entra na pill dela; qualquer outra remota ou tag tem pill própria. A primeira da lista é a que aparece. */
function pillsOf(refs: GraphCommit['refs']): Pill[] {
  const pills: Pill[] = []
  const tracked = new Set(refs.flatMap((r) => (r.kind === 'local' && r.upstream ? [r.upstream] : [])))
  for (const ref of refs) {
    if (ref.kind === 'tag') pills.push({ key: `tag:${ref.name}`, label: ref.name, title: ref.name, kind: 'tag', local: null, remote: null, current: false })
    else if (ref.kind === 'local') {
      const remote = ref.upstream && refs.some((r) => r.kind === 'remote' && r.name === ref.upstream) ? ref.upstream : null
      pills.push({ key: `local:${ref.name}`, label: ref.name, title: remote ? `${ref.name}\n${remote}` : ref.name, kind: 'branch', local: ref.name, remote, current: ref.current })
    } else if (!tracked.has(ref.name)) pills.push({ key: `remote:${ref.name}`, label: ref.name, title: ref.name, kind: 'branch', local: null, remote: ref.name, current: false })
  }
  return pills.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

interface PillHandlers {
  checkout(pill: Pill): void
  menu(pill: Pill, e: React.MouseEvent): void
}

function PillView({ pill, on }: { pill: Pill; on: PillHandlers }) {
  return <span className={`graph-pill ${pill.kind}`} title={pill.title}
    onDoubleClick={(e) => { if (pill.kind === 'branch') { e.stopPropagation(); on.checkout(pill) } }}
    onContextMenu={(e) => { if (pill.kind === 'branch') { e.preventDefault(); e.stopPropagation(); on.menu(pill, e) } }}>
    {pill.current && <RefIcon name="check" size={11} />}
    <span className="graph-pill-name">{pill.label}</span>
    {pill.kind === 'tag' ? <RefIcon name="tags" size={11} /> : <>
      {pill.local && <RefIcon name="laptop" size={11} />}{pill.remote && <RefIcon name="cloud" size={11} />}</>}
  </span>
}

/** Mostra só a primeira pill; as demais abrem numa lista sobreposta (portal, fora do clip da linha e sem mudar a altura dela). */
function Pills({ refs, color, on }: { refs: GraphCommit['refs']; color: string; on: PillHandlers }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const box = useRef<HTMLDivElement>(null)
  const pills = pillsOf(refs)
  useEffect(() => {
    if (!anchor) return
    const close = () => setAnchor(null)
    window.addEventListener('scroll', close, true)
    return () => window.removeEventListener('scroll', close, true)
  }, [anchor])
  if (!pills.length) return null
  const [first, ...rest] = pills
  const open = () => { if (rest.length && box.current) setAnchor(box.current.getBoundingClientRect()) }
  const style = { '--pill': color } as CSSProperties
  const close: PillHandlers = { checkout: (p) => { setAnchor(null); on.checkout(p) }, menu: (p, e) => { setAnchor(null); on.menu(p, e) } }
  return <div ref={box} className="graph-pills" style={style} onMouseEnter={open} onMouseLeave={() => setAnchor(null)}>
    <PillView pill={first!} on={close} />
    {rest.length > 0 && <button className="graph-pill-more" aria-haspopup="true" aria-expanded={!!anchor} aria-label={`Mais ${rest.length} refs`}
      onFocus={open} onBlur={() => setAnchor(null)}>+{rest.length}</button>}
    {anchor && createPortal(<div className="graph-pill-list" style={{ ...style, left: anchor.left, top: anchor.bottom - 4 }}>
      {rest.map((pill) => <PillView key={pill.key} pill={pill} on={close} />)}
    </div>, document.body)}
  </div>
}

export function Graph({ path }: { path: string }) {
  const [page, setPage] = useState<GraphPage | null>(null)
  const [layout, setLayout] = useState(() => loadGraphLayout(path))
  const [gear, setGear] = useState(false)
  const [maxLanes, setMaxLanes] = useState(1)
  const [loading, setLoading] = useState(false)
  const [reloading, setReloading] = useState(false)
  const [version, setVersion] = useState(0)
  const loadedPath = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<CommitDialog | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const busy = useRef(false)
  const generation = useRef(0)
  const pageRef = useRef<GraphPage | null>(null)
  const lastSelection = useRef<string | null>(null)
  const hbar = useRef<HTMLDivElement>(null)
  const pendingSelection = useRef<string | null>(null)
  const selectedSha = useApp((s) => s.selectedSha)
  const revision = useApp((s) => s.graphRevision[path.replace(/\\/g, '/').toLowerCase()] ?? s.graphRevision[path.replace(/\\/g, '/')] ?? 0)
  const head = useApp((s) => s.tabs.find((t) => t.path === path)?.head)
  const vis = useVisibility(selectVisibility(path))
  const [find, setFind] = useState<{ text: string; author: string } | null>(null)

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
  // Branch/Tag + Grafo vizinhas rolam juntas na horizontal; as demais colunas ficam fixas
  const refsAt = cols.indexOf('refs'), graphAt = cols.indexOf('graph')
  const pane = refsAt >= 0 && Math.abs(refsAt - graphAt) === 1 ? { start: Math.min(refsAt, graphAt), refsFirst: refsAt < graphAt } : null
  // A Branch/Tag encolhe com a janela e some do layout fixo: a largura real vem do cabeçalho, sem passar pelo estado
  useLayoutEffect(() => {
    const box = root.current
    const cell = pane ? box?.querySelectorAll<HTMLElement>('.graph-header > .graph-hcell')[refsAt] : undefined
    if (!box) return
    const apply = () => {
      const refs = cell?.getBoundingClientRect().width ?? 0
      box.style.setProperty('--refs-w', `${refs}px`)
      box.style.setProperty('--pane-w', `${refs + contentWidth}px`)
    }
    apply()
    if (!cell) return
    const observer = new ResizeObserver(apply)
    observer.observe(cell)
    return () => observer.disconnect()
  }, [pane !== null, refsAt, graphAt, contentWidth])

  useEffect(() => {
    const current = ++generation.current
    busy.current = true
    // mesmo repositório: mantém o grafo antigo sob um véu até chegarem os dados novos
    const same = loadedPath.current === path && pageRef.current !== null
    if (!same) {
      pageRef.current = null
      setPage(null)
      setMaxLanes(1)
    }
    setReloading(same)
    setLoading(true)
    void core.graphPage(path, null, PAGE, graphVisibility(vis)).then((next) => {
      if (generation.current !== current) return
      pageRef.current = next
      loadedPath.current = path
      setPage(next)
      setVersion((v) => v + 1)
      setMaxLanes(Math.max(1, ...next.commits.map((commit) => commit.laneCount)))
      if (!useApp.getState().selectedSha && next.commits[0]) actions.selectCommit(next.commits[0].sha)
    }, (err) => { if (generation.current === current) actions.reportError(err) }).finally(() => {
      if (generation.current === current) { busy.current = false; setLoading(false); setReloading(false) }
    })
    return () => { generation.current++ }
  }, [path, revision, vis.hidden, vis.solo, vis.smart])

  const loadMore = () => {
    const currentPage = pageRef.current
    if (!currentPage?.next || busy.current) return
    busy.current = true
    setLoading(true)
    const current = generation.current
    void core.graphPage(path, currentPage.next, PAGE, graphVisibility(vis)).then((next) => {
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
  useEffect(() => {
    const open = (e: KeyboardEvent) => {
      if (!matchesShortcut('Ctrl+F', e)) return
      e.preventDefault()
      setFind((f) => f ?? { text: '', author: '' })
      requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('.graph-filter input')?.focus())
    }
    window.addEventListener('keydown', open)
    return () => window.removeEventListener('keydown', open)
  }, [])
  const needle = find?.text.trim().toLocaleLowerCase() ?? ''
  /** Busca e autor só esmaecem as linhas: filtrar tiraria commits e quebraria as lanes. */
  const matches = (c: GraphCommit) => !find || ((!needle || `${c.subject}\n${c.description}\n${c.sha}`.toLocaleLowerCase().includes(needle)) && (!find.author || c.author === find.author))
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

  const openFind = () => {
    setFind((f) => f ?? { text: '', author: '' })
    requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('.graph-filter input')?.focus())
  }
  const branchActions = useBranchActions(path)
  /** Resolve a pill na ref completa (a lista de refs traz upstream e se a local existe) antes de agir. */
  const targetOf = async (pill: Pill): Promise<BranchTarget | null> => {
    const refs = await core.listRefs(path).catch(() => null)
    if (!refs) return null
    const local = pill.local ? refs.local.find((b) => b.name === pill.local) : undefined
    if (local) return { kind: 'local', ref: local }
    const remote = refs.remotes.flatMap((g) => [...g.branches, ...g.folders.flatMap((f) => f.branches)]).find((r) => `${r.remote}/${r.name}` === pill.remote)
    return remote ? { kind: 'remote', ref: remote, local: refs.local.find((b) => b.name === remote.name) } : null
  }
  const pillHandlers: PillHandlers = {
    checkout: (pill) => void targetOf(pill).then((t) => { if (t) branchActions.checkout(t) }),
    menu: (pill, e) => {
      const anchor = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
      void targetOf(pill).then((t) => { if (t) void branchActions.open(t, anchor) })
    },
  }
  const branch = head?.kind === 'branch' ? head.name : head?.sha ?? 'HEAD'
  const cell = (id: ColId, commit: GraphCommit | null | undefined, wip: boolean) => {
    switch (id) {
      case 'refs': return <div key={id} className="graph-refs">{commit && <Pills refs={commit.refs} color={commit.color} on={pillHandlers} />}{commit && commit.refs.length > 0 &&
        <span className="graph-ref-connector" style={{ borderColor: commit.color }} />}</div>
      case 'graph': return <div key={id} className="graph-cell">
        <div className="graph-canvas" style={{ width: contentWidth }}>
          {commit ? <CommitSvg row={commit} width={contentWidth} geo={geo} compact={layout.compact} /> : <svg width={contentWidth} height={ROW}>
            <circle cx={geo.first} cy="14" r={layout.compact ? 5 : 10} fill="var(--surface-2)" stroke="#9c9992" strokeWidth="2" strokeDasharray="3 3" />
          </svg>}
        </div>
      </div>
      case 'message': return wip
        ? <span key={id} className="graph-message graph-wip"><em>// WIP</em>
          <span className="wip-chip changed"><RefIcon name="edit" size={11} />{page?.wip.changed ?? 0}</span>
          <span className="wip-chip added">+ {page?.wip.untracked ?? 0}</span></span>
        : <span key={id} className={`graph-message${commit && commit.parents.length > 1 ? ' merge' : ''}`} title={commit?.subject}>{commit?.subject}</span>
      case 'description': return <span key={id} className="graph-description" title={commit?.description}>{commit?.description}</span>
      case 'author': return <span key={id} className="graph-author" title={commit?.email}>
        {commit && layout.compact && <span className="avatar small" style={avatarStyle(commit.email)}>{initials(commit.author)}</span>}{commit?.author}</span>
      case 'date': return <span key={id} className="graph-date" title={commit ? fullDate.format(new Date(commit.timestamp * 1000)) : undefined}>{commit ? date.format(new Date(commit.timestamp * 1000)).replace(',', '') : ''}</span>
      case 'sha': return <span key={id} className="graph-sha" title={commit?.sha}>{commit?.sha.slice(0, 7)}</span>
    }
  }
  const cells = (commit: GraphCommit | null | undefined, wip: boolean) => cols.flatMap((id, i) => {
    if (!pane || i < pane.start || i > pane.start + 1) return [cell(id, commit, wip)]
    if (i === pane.start + 1) return []
    const both = [cell('refs', commit, wip), cell('graph', commit, wip)]
    return [<div key="pane" className="graph-pane"><div className="graph-pane-inner" >{pane.refsFirst ? both : both.reverse()}</div></div>]
  })
  return <div className="graph-view" ref={root}>
    <span className="sr-only" data-testid="current-branch">{branch}</span>
    {gear && <>
      <div className="graph-pop-overlay" onMouseDown={() => setGear(false)} />
      <div className="graph-pop" role="dialog" aria-label="Colunas do grafo" onKeyDown={(e) => { if (e.key === 'Escape') setGear(false) }}>
        {layout.order.map((id, i) => <div key={id} className="graph-pop-row">
          <label><input type="checkbox" checked={!layout.hidden.includes(id)} disabled={!COLUMNS[id].hideable}
            onChange={(e) => update((l) => ({ ...l, hidden: e.target.checked ? l.hidden.filter((h) => h !== id) : [...l.hidden, id] }))} /> {COLUMNS[id].label}</label>
          <button aria-label={`Subir ${COLUMNS[id].label}`} disabled={i === 0} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, -1) }))}>▲</button>
          <button aria-label={`Descer ${COLUMNS[id].label}`} disabled={i === layout.order.length - 1} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, 1) }))}>▼</button>
        </div>)}
        <label className="graph-pop-row"><input type="checkbox" checked={vis.smart} onChange={(e) => updateVisibility(path, (v) => ({ ...v, smart: e.target.checked }))} /> Visibilidade inteligente</label>
        <label className="graph-pop-row"><input type="checkbox" checked={layout.compact} onChange={(e) => update((l) => ({ ...l, compact: e.target.checked }))} /> Layout compacto</label>
        <button className="graph-pop-reset" onClick={() => update(() => DEFAULT_LAYOUT)}>Restaurar padrão</button>
      </div>
    </>}
    {find && <div className="graph-filter" role="search" onKeyDown={(e) => { if (e.key === 'Escape') setFind(null) }}>
      <input value={find.text} onChange={(e) => setFind({ ...find, text: e.target.value })} placeholder="Buscar na mensagem…" aria-label="Buscar na mensagem" />
      <select value={find.author} onChange={(e) => setFind({ ...find, author: e.target.value })} aria-label="Filtrar por autor">
        <option value="">Todos os autores</option>
        {[...new Set(commits.map((c) => c.author))].sort().map((a) => <option key={a} value={a}>{a}</option>)}
      </select>
      <button aria-label="Fechar busca" onClick={() => setFind(null)}>✕</button>
    </div>}
    <div className="graph-header graph-grid">
      <button className="graph-gear" aria-label="Colunas do grafo" title="Colunas do grafo" aria-expanded={gear} onClick={() => setGear(!gear)}><RefIcon name="sliders" size={15} /></button>
      {cols.map((id) => <div key={id} className="graph-hcell">
        <span className="graph-title">{COLUMNS[id].label}
            {id === 'message' && <button className="graph-tool" aria-label="Buscar na mensagem" title="Buscar na mensagem (Ctrl+F)" onClick={() => openFind()}><RefIcon name="search" size={13} /></button>}
            {id === 'author' && <button className="graph-tool" aria-label="Filtrar por autor" title="Filtrar por autor" onClick={() => openFind()}><RefIcon name="filter" size={13} /></button>}
            {id === 'message' && vis.solo && <button className="graph-chip" title="Sair do Solo" onClick={() => updateVisibility(path, (v) => ({ ...v, solo: null }))}>Solo: {vis.solo.replace(/^refs\/(heads|remotes)\//, '')} ✕</button>}
          </span>
        {id !== 'message' && <div className={`col-handle ${cols.indexOf(id) < cols.indexOf('message') ? 'after' : 'before'}`} role="separator" aria-orientation="vertical"
          aria-label={`Redimensionar ${COLUMNS[id].label}`} onPointerDown={(e) => resize(id, e)} onDoubleClick={() => fit(id)} />}
      </div>)}
    </div>
    <div className="graph-body">
    <div className="graph-list" ref={scroller} onWheel={(e) => {
      const dx = e.shiftKey ? e.deltaY : e.deltaX
      if (dx) hbar.current!.scrollLeft += dx
    }} onScroll={(e) => {
      const box = e.currentTarget
      if (box.scrollTop + box.clientHeight > box.scrollHeight - 500) loadMore()
    }}>
      <div key={version} className="graph-rows" style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const commit = item.index ? commits[item.index - 1] : null
          const wip = !item.index
          const selected = commit ? selectedSha === commit.sha : selectedSha === 'wip'
          return <div key={item.key} className={`graph-row graph-grid${selected ? ' selected' : ''}${commit && !matches(commit) ? ' dim' : ''}`} style={{ height: ROW, transform: `translateY(${item.start}px)` }}
            onClick={() => actions.selectCommit(commit?.sha ?? 'wip')}
            onContextMenu={(e) => { if (commit) void openMenu(commit, e) }}
            >
            {cells(commit, wip)}
          </div>
        })}
      </div>
      {!commits.length && !loading && <div className="graph-empty">Este repositório ainda não tem commits.</div>}
      {loading && !reloading && <div className="graph-loading" role="status">Carregando commits…</div>}
    </div>
    {reloading && <div className="graph-veil" role="status"><span className="spin" aria-hidden="true">⟳</span> Atualizando grafo</div>}
    </div>
    <div className="graph-footer graph-grid">
      <div className="graph-scrollbar" ref={hbar} style={{ gridColumn: `${(pane?.start ?? graphAt) + 1} / span ${pane ? 2 : 1}` }} aria-hidden="true"
        onScroll={(e) => root.current?.style.setProperty('--graph-offset', `${-e.currentTarget.scrollLeft}px`)}>
        <div className="graph-scroll-span" />
      </div>
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu do commit" onClose={() => setMenu(null)} />}
    {branchActions.overlay}
    {dialog && <CommitDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
