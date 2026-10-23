import { useVirtualizer } from '@tanstack/react-virtual'
import { createPortal } from 'react-dom'
import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type PointerEvent as ReactPointerEvent } from 'react'
import { core } from '../bridge'
import type { GraphCommit, GraphPage } from '../bridge/types'
import { actions, firstGraphPage, GRAPH_PAGE, isActiveTab, selectConflict, selectDiff, selectReviewList, selectSha, useApp } from '../store/app'
import { reviewMarks } from './reviewModel'
import { FindBar, focusFind, useFindShortcut } from './FindBar'
import { graphVisibility, localRef, selectVisibility, updateVisibility, useVisibility } from '../store/visibility'
import { AuthorFilter } from './AuthorFilter'
import { Avatar, initials, useGravatar } from './avatar'
import type { BranchTarget } from './branchMenu'
import { commitMenu, type CommitDialog } from './commitMenu'
import { CommitDialogs } from './CommitDialogs'
import { Menu } from './Menu'
import { useBranchActions } from './useBranchActions'
import { Icon } from './Icon'
import { copyText, menuBase } from './menuBase'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import {
  COLUMNS, DEFAULT_LAYOUT, ROW, columnWidth, dragColumnWidth, geometry, gridTemplate, loadGraphLayout, moveColumn, saveGraphLayout, segmentPath, visibleColumns,
  type ColId, type GraphLayout,
} from './graphColumns'

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })
const formatDate = (ts: number) => dateFmt.format(new Date(ts * 1000)).replace(', ', ' - ')
const fullDate = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeStyle: 'short' })
type Geo = ReturnType<typeof geometry>


/** Linha tracejada do WIP até o HEAD: atravessa as linhas entre os dois ('through') e termina no centro do HEAD ('end'). */
function CommitSvg({ row, width, geo, compact, wipLink, wipColor, wipX }: { row: GraphCommit; width: number; geo: Geo; compact: boolean; wipLink: 'through' | 'end' | null; wipColor: string; wipX: number }) {
  const x = geo.first + row.lane * geo.lane
  const photo = useGravatar(row.email)
  return <svg width={width} height={ROW} viewBox={`0 0 ${width} ${ROW}`} aria-label={`Grafo de ${row.sha.slice(0, 7)}`}>
    <rect className="lane-band" x={x} y="1" width="4000" height={ROW - 2} fill={row.color} />
    {row.refs.length > 0 && <path d={`M0 14 H${x}`} stroke={row.head ? `color-mix(in srgb, ${row.color} 55%, black)` : row.color} strokeOpacity={row.head ? 1 : 0.55} strokeWidth={row.head ? 2 : 1} />}
    {row.segments.map((segment, index) => <path key={`${segment.kind}:${segment.fromLane}:${segment.toLane}:${index}`}
      d={segmentPath(segment, geo)} fill="none" stroke={segment.color} strokeWidth="2" />)}
    {wipLink && <path d={`M${wipX} 0 V${wipLink === 'end' ? 14 : 28}`} fill="none" stroke={wipColor} strokeWidth="2" strokeDasharray="3 3" />}
    {row.head && <circle cx={x} cy="14" r={compact ? 8 : 12} fill="none" stroke="#5b8def" strokeWidth="2" />}
    {compact
      ? row.parents.length > 1
        ? <circle cx={x} cy="14" r="4" fill="none" stroke={row.color} strokeWidth="2" />
        : <circle cx={x} cy="14" r="5" fill={row.color} />
      : <>
        <circle cx={x} cy="14" r="10" fill="var(--surface-2)" stroke={row.color} strokeWidth="2" />
        {row.parents.length > 1
          ? <circle cx={x} cy="14" r="4" fill="none" stroke={row.color} strokeWidth="2" />
          : <>
            <text x={x} y="17" textAnchor="middle" fill="var(--text)" fontSize="7" fontWeight="600">{initials(row.author)}</text>
            {photo.url && <image href={photo.url} x={x - 9} y="5" width="18" height="18" style={{ clipPath: 'circle(50%)' }} onError={photo.fail} />}
          </>}
      </>}
  </svg>
}

const NO_COMMITS: GraphCommit[] = []
let pillCtx: CanvasRenderingContext2D | null | undefined
/** Largura da maior pill que a coluna mostra (a primeira de cada commit + o chip `+N`, e a fantasma), mais o respiro da célula. */
/** Seleção de commit fora da página carrega mais páginas só até aqui: tip oculto/distante não pode carregar o histórico inteiro. */
const JUMP_LIMIT = 2000

function refsMinWidth(commits: GraphCommit[]): number {
  pillCtx ??= document.createElement('canvas').getContext('2d')
  if (!pillCtx) return 0
  pillCtx.font = `12px ${getComputedStyle(document.documentElement).getPropertyValue('--font-mono') || 'monospace'}`
  const ctx = pillCtx
  // borda 2 + padding 14 + nome + 16 (ícone 11 + gap 5) por ícone, +4 em check/laptop/cloud (15)
  const width = (name: string, icons: number) => 16 + ctx.measureText(name).width + 16 * icons
  let widest = 0
  for (const c of commits) {
    const pills = pillsOf(c.refs)
    const first = pills[0]
    if (first) {
      const chip = pills.length > 1 ? 3 + 14 + ctx.measureText(`+${pills.length - 1}`).width : 0
      widest = Math.max(widest, width(first.label, (first.current ? 1 : 0) + (first.kind === 'tag' ? 1 : (first.local ? 1 : 0) + (first.remote ? 1 : 0))) + chip + (first.kind === 'branch' ? ((first.current ? 1 : 0) + (first.local ? 1 : 0) + (first.remote ? 1 : 0)) * 4 : 0))
    }
    if (c.ghost) widest = Math.max(widest, width(c.ghost.name, 1 + (c.ghost.current ? 1 : 0)))
  }
  // padding esquerdo da célula (13) + trecho mínimo do conector (4)
  return widest ? Math.ceil(widest) + 17 : 0
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
    } else if (!tracked.has(ref.name)) pills.push({ key: `remote:${ref.name}`, label: ref.name.replace(/^origin\//, ''), title: ref.name, kind: 'branch', local: null, remote: ref.name, current: false })
  }
  return pills.sort((a, b) => rank(a) - rank(b) || a.label.localeCompare(b.label))
}

interface PillHandlers {
  checkout(pill: Pill): void
  menu(pill: Pill, e: React.MouseEvent): void
}

function PillView({ pill, on, highlight }: { pill: Pill; on: PillHandlers; highlight: string | null }) {
  const highlighted = !!highlight && (highlight === (pill.local && localRef(pill.local)) || highlight === (pill.remote && `refs/remotes/${pill.remote}`))
  return <span className={`graph-pill ${pill.kind}${pill.current ? ' current' : ''}`} title={highlighted ? `${pill.title}\nBranch em destaque` : pill.title}
    onDoubleClick={(e) => { if (pill.kind === 'branch') { e.stopPropagation(); on.checkout(pill) } }}
    onContextMenu={(e) => { if (pill.kind === 'branch') { e.preventDefault(); e.stopPropagation(); on.menu(pill, e) } }}>
    {pill.current && <Icon name="check" size={15} />}
    {highlighted && <Icon name="highlight" size={12} />}
    <span className="graph-pill-name">{pill.label}</span>
    {pill.kind === 'tag' ? <Icon name="tags" size={11} /> : <>
      {pill.local && <Icon name="laptop" size={15} />}{pill.remote && <Icon name="cloud" size={15} />}</>}
  </span>
}

/** Mostra só a primeira pill; as demais abrem numa lista sobreposta (portal, fora do clip da linha e sem mudar a altura dela). */
function Pills({ refs, color, on, highlight }: { refs: GraphCommit['refs']; color: string; on: PillHandlers; highlight: string | null }) {
  const [anchor, setAnchor] = useState<DOMRect | null>(null)
  const [dim, setDim] = useState(false)
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
  const open = () => {
    if (!rest.length || !box.current) return
    setDim(!!box.current.closest('.dim')) // a lista está num portal, fora da linha esmaecida pela busca
    setAnchor(box.current.getBoundingClientRect())
  }
  const style = { '--pill': color } as CSSProperties
  const close: PillHandlers = { checkout: (p) => { setAnchor(null); on.checkout(p) }, menu: (p, e) => { setAnchor(null); on.menu(p, e) } }
  return <div ref={box} className="graph-pills" style={style} onMouseEnter={open} onMouseLeave={() => setAnchor(null)}>
    <PillView pill={first!} on={close} highlight={highlight} />
    {rest.length > 0 && <button className="graph-pill-more" aria-haspopup="true" aria-expanded={!!anchor} aria-label={`Mais ${rest.length} refs`}
      onFocus={open} onBlur={() => setAnchor(null)}>+{rest.length}</button>}
    {anchor && createPortal(<div className={dim ? 'graph-pill-list dim' : 'graph-pill-list'} style={{ ...style, left: anchor.left, top: anchor.bottom - 4 }}>
      {rest.map((pill) => <PillView key={pill.key} pill={pill} on={close} highlight={highlight} />)}
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
  const [conflicts, setConflicts] = useState(0)
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
  const selectedSha = useApp(selectSha(path))
  const revision = useApp((s) => s.graphRevision[path.replace(/\\/g, '/').toLowerCase()] ?? s.graphRevision[path.replace(/\\/g, '/')] ?? 0)
  const head = useApp((s) => s.tabs.find((t) => t.path === path)?.head)
  const vis = useVisibility(selectVisibility(path))
  const dateOrder = useApp((s) => s.prefs.dateOrder)
  const ghostRefs = useApp((s) => s.prefs.ghostRefs)
  const doubleClickCheckout = useApp((s) => s.prefs.doubleClickCheckout)
  const [find, setFind] = useState<{ text: string } | null>(null)
  const authors = useApp((s) => s.tabs.find((t) => t.path === path)?.authors)
  const [authorAnchor, setAuthorAnchor] = useState<Rect | null>(null)

  const geo = geometry(layout.compact)
  const contentWidth = geo.first * 2 + maxLanes * geo.lane
  const cols = visibleColumns(layout)
  // useMemo manual: o Compiler pula componente com useVirtualizer, e medir todas as pills a cada frame de scroll trava o grafo
  const pillsMin = useMemo(() => refsMinWidth(page?.commits ?? NO_COMMITS), [page])
  const refsMin = pillsMin + (vis.highlight ? 17 : 0) // ícone da Branch em destaque (12 + gap 5)
  const bounds = { graphMax: contentWidth, refsMin }
  const update = (fn: (l: GraphLayout) => GraphLayout) => setLayout((l) => {
    const next = fn(l)
    saveGraphLayout(path, next)
    return next
  })
  // reaplica a cada render: o arrasto escreveu direto no DOM, e o React não sabe disso
  useLayoutEffect(() => { root.current?.style.setProperty('--graph-cols', gridTemplate(layout, undefined, bounds)) })
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
    let active = true
    void core.conflictList(path).then((list) => active && setConflicts(list.length), () => active && setConflicts(0))
    return () => { active = false }
  }, [path, revision])
  // Commits revisados: o marcador acompanha refs que mudam (rodada concluída, push do dev, rebase)
  useEffect(() => { void actions.loadReviews(path) }, [path, revision])
  const reviews = useApp(selectReviewList(path))
  const marks = useMemo(() => reviewMarks(reviews), [reviews])

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
    void firstGraphPage(path, graphVisibility(vis, dateOrder)).then((next) => {
      if (generation.current !== current) return
      pageRef.current = next
      loadedPath.current = path
      setPage(next)
      setVersion((v) => v + 1)
      setMaxLanes(Math.max(1, ...next.commits.map((commit) => commit.laneCount)))
      if (!selectSha(path)(useApp.getState()) && next.commits[0]) actions.selectCommit(path, next.commits[0].sha)
    }, (err) => { if (generation.current === current) actions.reportError(err, path) }).finally(() => {
      if (generation.current === current) { busy.current = false; setLoading(false); setReloading(false) }
    })
    return () => { generation.current++ }
  }, [path, revision, vis.hidden, vis.solo, vis.smart, vis.highlight, dateOrder])

  const loadMore = () => {
    const currentPage = pageRef.current
    if (!currentPage?.next || busy.current) return
    busy.current = true
    setLoading(true)
    const current = generation.current
    void core.graphPage(path, currentPage.next, GRAPH_PAGE, graphVisibility(vis, dateOrder)).then((next) => {
      if (generation.current !== current) return
      const merged = { commits: [...currentPage.commits, ...next.commits], next: next.next, wip: next.wip }
      pageRef.current = merged
      setPage(merged)
      setMaxLanes((lanes) => Math.max(lanes, ...next.commits.map((commit) => commit.laneCount)))
    }, (err) => { if (generation.current === current) actions.reportError(err, path) }).finally(() => {
      if (generation.current === current) { busy.current = false; setLoading(false) }
    })
  }
  const commits = page?.commits ?? []
  // sem nada para commitar a linha WIP some e os commits começam no índice 0
  const top = page && page.wip.changed + page.wip.untracked + conflicts > 0 ? 1 : 0
  const virtual = useVirtualizer({ count: commits.length + top, getScrollElement: () => scroller.current,
    estimateSize: () => ROW, overscan: 12, getItemKey: (index) => index < top ? `wip:${path}` : commits[index - top]!.sha })
  useEffect(() => {
    if (!selectedSha || !page) return
    if (selectedSha !== lastSelection.current) {
      lastSelection.current = selectedSha
      pendingSelection.current = selectedSha
    }
    const target = pendingSelection.current
    if (!target) return
    if (target === 'wip') { if (top) virtual.scrollToIndex(0); pendingSelection.current = null; return }
    const index = page.commits.findIndex((commit) => commit.sha === target)
    if (index >= 0) { virtual.scrollToIndex(index + top, { align: 'auto' }); pendingSelection.current = null }
    else if (page.next && page.commits.length < JUMP_LIMIT) loadMore()
    else pendingSelection.current = null
  }, [selectedSha, page, top])

  /** Largura útil da grade: sem a barra de rolagem da lista (10px). */
  const room = () => (root.current?.clientWidth ?? 0) - 10
  const resize = (id: ColId, e: ReactPointerEvent<HTMLDivElement>) => {
    const box = root.current
    if (!box || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')
    const start = columnWidth(layout, id, bounds)
    const startX = e.clientX
    const sign = cols.indexOf(id) < cols.indexOf('message') ? 1 : -1 // à direita da Mensagem, arrastar para a esquerda alarga
    let width = start
    const onMove = (ev: PointerEvent) => {
      width = dragColumnWidth(layout, id, start + sign * (ev.clientX - startX), room(), bounds)
      box.style.setProperty('--graph-cols', gridTemplate(layout, { id, width }, bounds))
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
      : id === 'description' ? c.description : id === 'author' ? c.author : id === 'date' ? formatDate(c.timestamp) : c.sha.slice(0, 7)
    const extra = id === 'refs' ? 44 : id === 'author' && layout.compact ? 36 : 16
    const wanted = id === 'graph' ? contentWidth : Math.max(0, ...commits.map((c) => ctx.measureText(text(c)).width)) + extra
    update((l) => ({ ...l, widths: { ...l.widths, [id]: dragColumnWidth(l, id, Math.ceil(wanted), room(), bounds) } }))
  }

  useEffect(() => {
    const copy = (e: KeyboardEvent) => {
      if (!isActiveTab(path) || !selectedSha || selectedSha === 'wip' || e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return
      if (!matchesShortcut('Ctrl+Shift+C', e)) return
      e.preventDefault()
      copyText(selectedSha)
    }
    window.addEventListener('keydown', copy)
    return () => window.removeEventListener('keydown', copy)
  }, [selectedSha, path])
  // com diff ou conflito aberto, o Ctrl+F é deles
  useFindShortcut(path, () => openFind(), () => !!(selectDiff(path)(useApp.getState()) || selectConflict(path)(useApp.getState())))
  // Esc fecha a busca mesmo com o foco fora dela (ex.: depois de clicar num commit)
  useEffect(() => {
    if (!find) return
    const onEsc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !e.defaultPrevented && isActiveTab(path) && !selectDiff(path)(useApp.getState()) && !selectConflict(path)(useApp.getState())) setFind(null)
    }
    window.addEventListener('keydown', onEsc)
    return () => window.removeEventListener('keydown', onEsc)
  }, [!find, path])
  const hasText = (c: GraphCommit, needle: string) => `${c.subject}\n${c.description}\n${c.sha}\n${c.refs.map((r) => r.name).join('\n')}`.toLocaleLowerCase().includes(needle)
  const byAuthor = (c: GraphCommit) => !authors?.length || authors.includes(c.email.toLowerCase())
  const needle = find?.text.trim().toLocaleLowerCase() ?? ''
  /** Busca e Autores só esmaecem as linhas: filtrar tiraria commits e quebraria as lanes. */
  const matches = (c: GraphCommit) => (!needle || hasText(c, needle)) && byAuthor(c)
  /** Ocorrências da busca entre os commits carregados; como no navegador, o selecionado é a ocorrência atual. */
  const hitsFor = (text: string) => {
    const n = text.trim().toLocaleLowerCase()
    return n ? commits.filter((c) => hasText(c, n) && byAuthor(c)) : []
  }
  const hits = hitsFor(find?.text ?? '')
  const current = hits.findIndex((c) => c.sha === selectedSha)
  const step = (by: 1 | -1) => {
    if (hits.length) actions.selectCommit(path, hits[current < 0 ? (by > 0 ? 0 : hits.length - 1) : (current + by + hits.length) % hits.length]!.sha)
  }
  const search = (text: string) => {
    setFind({ text })
    const first = hitsFor(text)[0]
    if (first) return actions.selectCommit(path, first.sha)
    // o tip da branch pode estar numa página ainda não carregada: o efeito de seleção carrega até achar
    const n = text.trim().toLocaleLowerCase()
    if (!n) return
    void core.listRefs(path).then((refs) => {
      const remotes = refs.remotes.flatMap((g) => [...g.branches, ...g.folders.flatMap((f) => f.branches)]).map((r) => ({ name: `${r.remote}/${r.name}`, sha: r.sha }))
      const tip = [...refs.local, ...remotes].find((r) => r.name.toLocaleLowerCase().includes(n))
      if (tip) actions.selectCommit(path, tip.sha)
    }, () => {})
  }
  const openMenu = async (commit: GraphCommit, e: React.MouseEvent) => {
    e.preventDefault()
    actions.selectCommit(path, commit.sha)
    const anchor = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
    const base = await menuBase(path)
    if (!base) return
    setMenu({ anchor, items: commitMenu(commit, {
      ...base, dialog: setDialog, execute: (kind) => void actions.execute(path, kind),
      checkout: (sha) => void actions.checkoutRef(path, { type: 'checkout', target: sha }),
      newBranch: (start) => actions.setPalette('createBranch', start), resetHard: (sha) => void actions.requestResetHard(path, sha),
    }) })
  }

  /** Ctrl+F com a busca aberta só devolve o foco e seleciona o texto, como no navegador. */
  function openFind() {
    setFind((f) => f ?? { text: '' })
    focusFind(root)
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
    checkout: (pill) => { if (doubleClickCheckout) void targetOf(pill).then((t) => { if (t) branchActions.checkout(t) }) },
    menu: (pill, e) => {
      const anchor = { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }
      void targetOf(pill).then((t) => { if (t) void branchActions.open(t, anchor) })
    },
  }
  const branch = head?.kind === 'branch' ? head.name : head?.sha ?? 'HEAD'
  const headCommit = commits.find((c) => c.head)
  const headColor = headCommit?.color ?? '#5b8def'
  const wipSpan = new Set<string>()
  if (top) for (const c of commits) { wipSpan.add(c.sha); if (c.head) break }
  const wipX = geo.first + (headCommit?.lane ?? 0) * geo.lane // o WIP fica na lane do HEAD
  const cell = (id: ColId, commit: GraphCommit | null | undefined, wip: boolean) => {
    switch (id) {
      case 'refs': return <div key={id} className="graph-refs">{commit && <Pills refs={commit.refs} color={commit.color} on={pillHandlers} highlight={vis.highlight} />}{commit && commit.refs.length > 0 &&
        <span className={`graph-ref-connector${commit.head ? ' current' : ''}`} style={{ borderColor: commit.head ? `color-mix(in srgb, ${commit.color} 55%, black)` : commit.color }} />}
        {ghostRefs && commit?.ghost && !commit.refs.length && <span className="graph-pill graph-ghost" style={{ '--pill': commit.color } as CSSProperties} aria-hidden="true">
          {commit.ghost.current && <Icon name="check" size={15} />}<span className="graph-pill-name">{commit.ghost.name}</span><Icon name={commit.ghost.remote ? 'cloud' : 'laptop'} size={11} /></span>}</div>
      case 'graph': return <div key={id} className="graph-cell">
        <div className="graph-canvas" style={{ width: contentWidth }}>
          {commit ? <CommitSvg row={commit} width={contentWidth} geo={geo} compact={layout.compact} wipLink={wipSpan.has(commit.sha) ? (commit.head ? 'end' : 'through') : null} wipColor={headColor} wipX={wipX} /> : <svg width={contentWidth} height={ROW}>
            <rect className="lane-band wip" x={wipX} y="1" width="4000" height={ROW - 2} fill={headColor} />
            <path d={`M${wipX} ${14 + (layout.compact ? 5 : 10)} V28`} fill="none" stroke={headColor} strokeWidth="2" strokeDasharray="3 3" />
            <circle cx={wipX} cy="14" r={layout.compact ? 5 : 10} fill="var(--surface-2)" stroke={headColor} strokeWidth="2" strokeDasharray="3 3" />
          </svg>}
        </div>
      </div>
      case 'message': return wip && conflicts > 0
        ? <span key={id} className="graph-message graph-wip graph-conflict"><Icon name="warning" size={13} />
          {conflicts} {conflicts === 1 ? 'conflito de arquivo' : 'conflitos de arquivo'} pendente{conflicts === 1 ? '' : 's'} em {branch}</span>
        : wip
        ? <span key={id} className="graph-message graph-wip"><em>// WIP</em>
          <span className="wip-chip changed"><Icon name="edit" size={11} />{page?.wip.changed ?? 0}</span>
          <span className="wip-chip added">+ {page?.wip.untracked ?? 0}</span></span>
        : <span key={id} className={`graph-message${commit && commit.parents.length > 1 ? ' merge' : ''}`} title={commit?.subject}>
          {commit && marks.get(commit.sha)?.map((m) => <button key={m.branch} className={m.rewritten ? 'graph-review-mark rewritten' : 'graph-review-mark'} title={m.title}
            aria-label={m.title} onClick={(e) => { e.stopPropagation(); void actions.openReview(path, m.branch) }}><Icon name="shown" size={12} strokeWidth={2} /></button>)}
          {commit?.subject}</span>
      case 'description': return <span key={id} className="graph-description" title={commit?.description}>{commit?.description}</span>
      case 'author': return <span key={id} className="graph-author" title={commit?.email}>
        {commit && layout.compact && <Avatar small name={commit.author} email={commit.email} />}{commit?.author}</span>
      case 'date': return <span key={id} className="graph-date" title={commit ? fullDate.format(new Date(commit.timestamp * 1000)) : undefined}>{commit ? formatDate(commit.timestamp) : ''}</span>
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
          <button aria-label={`Subir ${COLUMNS[id].label}`} disabled={i === 0} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, -1) }))}><Icon name="chevronUp" size={13} strokeWidth={2} /></button>
          <button aria-label={`Descer ${COLUMNS[id].label}`} disabled={i === layout.order.length - 1} onClick={() => update((l) => ({ ...l, order: moveColumn(l.order, id, 1) }))}><Icon name="chevronDown" size={13} strokeWidth={2} /></button>
        </div>)}
        <label className="graph-pop-row"><input type="checkbox" checked={vis.smart} onChange={(e) => updateVisibility(path, (v) => ({ ...v, smart: e.target.checked }))} /> Visibilidade inteligente</label>
        <label className="graph-pop-row"><input type="checkbox" checked={layout.compact} onChange={(e) => update((l) => ({ ...l, compact: e.target.checked }))} /> Layout compacto</label>
        <button className="graph-pop-reset" onClick={() => update(() => DEFAULT_LAYOUT)}>Restaurar padrão</button>
      </div>
    </>}
    {find && <FindBar text={find.text} label="Buscar branch, mensagem ou SHA" count={needle ? `${current + 1}/${hits.length}${page?.next ? '+' : ''}` : ''}
      disabled={!hits.length} onText={search} onStep={step} onClose={() => setFind(null)} />}
    <div className="graph-header graph-grid">
      <button className="graph-gear" aria-label="Colunas do grafo" title="Colunas do grafo" aria-expanded={gear} onClick={() => setGear(!gear)}><Icon name="sliders" size={15} /></button>
      {cols.map((id) => <div key={id} className="graph-hcell">
        <span className="graph-title">{COLUMNS[id].label}
            {id === 'message' && <button className="graph-tool" aria-label="Buscar branch, mensagem ou SHA" title="Buscar branch, mensagem ou SHA (Ctrl+F)" onClick={openFind}><Icon name="search" size={13} /></button>}
            {id === 'author' && <button className={`graph-tool${authors?.length ? ' active' : ''}`} aria-label="Filtrar por autor" title="Filtrar por autor"
              aria-expanded={!!authorAnchor} onClick={(e) => setAuthorAnchor(e.currentTarget.getBoundingClientRect())}><Icon name="filter" size={13} /></button>}
            {id === 'message' && vis.solo && <button className="graph-chip" title="Sair do Solo" onClick={() => updateVisibility(path, (v) => ({ ...v, solo: null }))}>Solo: {vis.solo.replace(/^refs\/(heads|remotes)\//, '')} <Icon name="close" size={12} /></button>}
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
      if (box.scrollTop + box.clientHeight > box.scrollHeight - 800) loadMore()
    }}>
      <div key={version} className="graph-rows" style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const commit = item.index >= top ? commits[item.index - top] : null
          const wip = item.index < top
          const selected = commit ? selectedSha === commit.sha : selectedSha === 'wip'
          return <div key={item.key} className={`graph-row graph-grid${wip && conflicts > 0 ? ' conflict' : ''}${selected ? ' selected' : ''}${commit && !matches(commit) ? ' dim' : ''}`} style={{ height: ROW, transform: `translateY(${item.start}px)`, '--lane': commit?.color ?? headColor } as CSSProperties}
            onClick={() => actions.selectCommit(path, commit?.sha ?? 'wip')}
            onContextMenu={(e) => { if (commit) void openMenu(commit, e) }}
            >
            {cells(commit, wip)}
          </div>
        })}
      </div>
      {!commits.length && !loading && <div className="graph-empty">Este repositório ainda não tem commits.</div>}
      {loading && !reloading && <div className="graph-loading" role="status">Carregando commits…</div>}
    </div>
    {reloading && <div className="graph-veil" role="status"><Icon name="refresh" size={13} spin /> Atualizando grafo</div>}
    </div>
    <div className="graph-footer graph-grid">
      <div className="graph-scrollbar" ref={hbar} style={{ gridColumn: `${(pane?.start ?? graphAt) + 1} / span ${pane ? 2 : 1}` }} aria-hidden="true"
        onScroll={(e) => root.current?.style.setProperty('--graph-offset', `${-e.currentTarget.scrollLeft}px`)}>
        <div className="graph-scroll-span" />
      </div>
    </div>
    {authorAnchor && <AuthorFilter path={path} anchor={authorAnchor} onClose={() => setAuthorAnchor(null)} />}
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu do commit" onClose={() => setMenu(null)} />}
    {branchActions.overlay}
    {dialog && <CommitDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
