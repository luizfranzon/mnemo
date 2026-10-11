import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { GraphCommit, GraphCursor, GraphPage, GraphSegment } from '../bridge/types'
import { actions, useApp } from '../store/app'

const ROW = 28
const LANE = 16
const FIRST = 12
const PAGE = 2000
const date = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' })

function pathOf(segment: GraphSegment): string {
  const from = FIRST + segment.fromLane * LANE
  const to = FIRST + segment.toLane * LANE
  if (segment.kind === 'pass') return `M${from} 0 V${ROW}`
  if (segment.kind === 'incoming') return from === to ? `M${from} 0 V14` : `M${from} 0 Q${from} 14 ${to} 14`
  return from === to ? `M${from} 14 V${ROW}` : `M${from} 14 Q${to} 14 ${to} ${ROW}`
}

function CommitSvg({ row, width }: { row: GraphCommit; width: number }) {
  const x = FIRST + row.lane * LANE
  const initials = row.author.trim().split(/\s+/).slice(0, 2).map((part) => part[0]?.toUpperCase() ?? '').join('') || '?'
  return <svg width={width} height={ROW} viewBox={`0 0 ${width} ${ROW}`} aria-label={`Grafo de ${row.sha.slice(0, 7)}`}>
    {row.refs.length > 0 && <path d={`M0 14 H${x}`} stroke={row.color} strokeOpacity="0.55" strokeWidth="1" />}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.fromLane}:${segment.toLane}:${index}`}
      d={pathOf(segment)} fill="none" stroke={segment.color} strokeWidth="2" />)}
    {row.head && <circle cx={x} cy="14" r="12" fill="none" stroke="#5b8def" strokeWidth="2" />}
    <circle cx={x} cy="14" r="10" fill="var(--surface-2)" stroke={row.color} strokeWidth="2" />
    {row.parents.length > 1
      ? <circle cx={x} cy="14" r="4" fill="none" stroke={row.color} strokeWidth="2" />
      : <text x={x} y="17" textAnchor="middle" fill="var(--text)" fontSize="7" fontWeight="600">{initials}</text>}
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
  const [graphWidth, setGraphWidth] = useState(144)
  const [loading, setLoading] = useState(false)
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

  useEffect(() => {
    const current = ++generation.current
    busy.current = true
    pageRef.current = null
    setPage(null)
    setGraphWidth(144)
    setLoading(true)
    void core.graphPage(path, null, PAGE).then((next) => {
      if (generation.current !== current) return
      pageRef.current = next
      setPage(next)
      setGraphWidth(Math.max(144, ...next.commits.map((commit) => FIRST * 2 + commit.laneCount * LANE)))
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
      setGraphWidth((width) => Math.max(width, ...next.commits.map((commit) => FIRST * 2 + commit.laneCount * LANE)))
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
  const branch = head?.kind === 'branch' ? head.name : head?.sha ?? 'HEAD'
  return <div className="graph-view" ref={root}>
    <div className="graph-meta"><span>Histórico</span><strong data-testid="current-branch">{branch}</strong></div>
    <div className="graph-header graph-grid">
      <span>Branch / Tag</span>
      <div className="graph-scrollbar" onScroll={(e) => root.current?.style.setProperty('--graph-offset', `${-e.currentTarget.scrollLeft}px`)}>
        <span>Grafo</span><div style={{ width: graphWidth, height: 1 }} />
      </div>
      <span>Mensagem</span><span>Autor</span><span>Data</span><span>SHA</span>
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
            onDoubleClick={() => { if (commit) void actions.checkoutRef(path, { type: 'checkout', target: commit.sha }) }}>
            <div className="graph-refs">{commit && <Pills refs={commit.refs} />}{commit && commit.refs.length > 0 &&
              <span className="graph-ref-connector" style={{ borderColor: commit.color }} />}</div>
            <div className="graph-cell">
              <div className="graph-canvas" style={{ width: graphWidth }}>
                {commit ? <CommitSvg row={commit} width={graphWidth} /> : <svg width={graphWidth} height={ROW}>
                  <circle cx={FIRST} cy="14" r="10" fill="var(--surface-2)" stroke="#9c9992" strokeWidth="2" strokeDasharray="3 3" />
                </svg>}
              </div>
            </div>
            <span className="graph-message">{wip ? `// WIP  ✎${page?.wip.changed ?? 0} +${page?.wip.untracked ?? 0}` : commit?.subject}</span>
            <span className="graph-author" title={commit?.email}>{commit?.author}</span>
            <span>{commit ? date.format(new Date(commit.timestamp * 1000)) : ''}</span>
            <span className="graph-sha" title={commit?.sha}>{commit?.sha.slice(0, 7)}</span>
          </div>
        })}
      </div>
      {!commits.length && !loading && <div className="graph-empty">Este repositório ainda não tem commits.</div>}
      {loading && <div className="graph-loading" role="status">Carregando commits…</div>}
    </div>
  </div>
}
