import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { LocalRef, RefListing, RemoteRef } from '../bridge/types'
import { actions, runningLabel, useApp } from '../store/app'
import { localRef, remoteRef, selectVisibility, toggleHidden, togglePinned, toggleSolo, updateVisibility, useVisibility, type Visibility } from '../store/visibility'
import { BranchDialogs } from './BranchDialogs'
import { branchMenu, remoteOf, type BranchDialog, type BranchTarget } from './branchMenu'
import { Menu } from './Menu'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import { toolbarAvailability } from './toolbarModel'

type Section = 'pinned' | 'local' | 'remotes' | 'worktrees' | 'stashes' | 'tags' | 'submodules'
type Row =
  | { type: 'section'; key: string; section: Section; label: string; count: number }
  | { type: 'folder'; key: string; name: string; count: number; depth: number }
  | { type: 'local'; key: string; ref: LocalRef; depth: number }
  | { type: 'remote'; key: string; ref: RemoteRef; depth: number }
  | { type: 'plain'; key: string; section: Section; name: string; sha?: string; depth: number }

const LABEL: Record<Section, string> = {
  pinned: 'Fixadas', local: 'Local', remotes: 'Remotos', worktrees: 'Worktrees', stashes: 'Stashes', tags: 'Tags', submodules: 'Submódulos',
}
const ICON: Record<Section, string> = {
  pinned: '⚑', local: '⑂', remotes: '☁', worktrees: '▱', stashes: '▣', tags: '◇', submodules: '▤',
}
const ROW_HEIGHT = 28

/** Refs fixadas à esquerda que ainda existem, na ordem em que foram fixadas. */
function pinnedRows(refs: RefListing, pinned: string[]): Row[] {
  const remotes = refs.remotes.flatMap((group) => [...group.branches, ...group.folders.flatMap((f) => f.branches)])
  return pinned.flatMap((name): Row[] => {
    const local = refs.local.find((b) => localRef(b.name) === name)
    if (local) return [{ type: 'local', key: `pin:${name}`, ref: local, depth: 1 }]
    const remote = remotes.find((r) => remoteRef(r.remote, r.name) === name)
    return remote ? [{ type: 'remote', key: `pin:${name}`, ref: remote, depth: 1 }] : []
  })
}

/** Ref completa de uma linha de branch (a chave da visibilidade); linhas sem branch nunca chegam aqui. */
function refName(row: Row): string {
  return row.type === 'local' ? localRef(row.ref.name) : row.type === 'remote' ? remoteRef(row.ref.remote, row.ref.name) : row.key
}

function counts(refs: RefListing, pinned: number): Record<Section, number> {
  return {
    pinned,
    local: refs.local.length,
    remotes: refs.remotes.reduce((sum, group) => sum + group.branches.length + group.folders.reduce((n, f) => n + f.branches.length, 0), 0),
    worktrees: refs.worktrees.length,
    stashes: refs.stashes.length,
    tags: refs.tags.length,
    submodules: refs.submodules.length,
  }
}

function visibleRows(refs: RefListing, collapsed: Set<string>, query: string, pinned: Row[]): Row[] {
  const q = query.trim().toLocaleLowerCase()
  const include = (name: string) => !q || name.toLocaleLowerCase().includes(q)
  const result: Row[] = []
  const count = counts(refs, pinned.length)
  const section = (key: Section, add: () => void) => {
    if (!count[key]) return
    const start = result.length
    result.push({ type: 'section', key: `section:${key}`, section: key, label: LABEL[key], count: count[key] })
    if (!collapsed.has(key) || q) add()
    if (q && result.length === start + 1) result.pop()
  }
  section('pinned', () => pinned.forEach((row) => {
    if ((row.type === 'local' || row.type === 'remote') && include(row.type === 'local' ? row.ref.name : `${row.ref.remote}/${row.ref.name}`)) result.push(row)
  }))
  section('local', () => refs.local.forEach((ref) => {
    if (include(ref.name)) result.push({ type: 'local', key: `refs/heads/${ref.name}`, ref, depth: 1 })
  }))
  section('remotes', () => refs.remotes.forEach((group) => {
    const children: Row[] = []
    for (const ref of group.branches) {
      if (include(`${group.name}/${ref.name}`)) children.push({ type: 'remote', key: `refs/remotes/${group.name}/${ref.name}`, ref, depth: 2 })
    }
    for (const folder of group.folders) {
      const matches = folder.branches.filter((ref) => include(`${group.name}/${ref.name}`))
      if (!matches.length) continue
      const folderKey = `remote:${group.name}/${folder.name}`
      children.push({ type: 'folder', key: folderKey, name: folder.name, count: folder.branches.length, depth: 2 })
      if (!collapsed.has(folderKey) || q) matches.forEach((ref) => children.push({ type: 'remote', key: `refs/remotes/${group.name}/${ref.name}`, ref, depth: 3 }))
    }
    if (!children.length) return
    const groupKey = `remote:${group.name}`
    result.push({ type: 'folder', key: groupKey, name: group.name, count: group.branches.length + group.folders.reduce((n, f) => n + f.branches.length, 0), depth: 1 })
    if (!collapsed.has(groupKey) || q) result.push(...children)
  }))
  const plain = (key: Section, entries: { name: string; sha?: string }[]) => section(key, () => entries.forEach((entry) => {
    if (include(entry.name)) result.push({ type: 'plain', key: `${key}:${entry.name}`, section: key, name: entry.name, sha: entry.sha, depth: 1 })
  }))
  plain('worktrees', refs.worktrees.map((w) => ({ name: w.branch ? `${w.branch}  ·  ${w.path}` : w.path })))
  plain('stashes', refs.stashes)
  plain('tags', refs.tags)
  plain('submodules', refs.submodules)
  return result
}

function loadCollapsed(path: string): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem(`mnemo.refs.collapsed:${path}`) ?? '[]') as string[]) }
  catch { return new Set() }
}

/** A lista inteira tem uma só área de rolagem virtualizada; pastas vêm agrupadas do core. */
export function RefPanel({ path, rail, expand }: { path: string; rail: boolean; expand: () => void }) {
  const [refs, setRefs] = useState<RefListing | null>(null)
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(path))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const running = useApp((s) => runningLabel(s, path))
  const undo = useApp((s) => s.tabs.find((t) => t.path === path)?.undo)
  const head = useApp((s) => s.tabs.find((t) => t.path === path)?.head)
  const toolbar = useApp((s) => s.tabs.find((t) => t.path === path)?.toolbar)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<BranchDialog | null>(null)
  useEffect(() => {
    if (running) return
    let active = true
    void core.listRefs(path).then((next) => { if (active) setRefs(next) }, (err) => { if (active) actions.reportError(err) })
    return () => { active = false }
  }, [path, running, undo])
  useEffect(() => {
    const focus = (e: KeyboardEvent) => {
      if (!(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f')) return
      e.preventDefault()
      if (rail) expand()
      requestAnimationFrame(() => input.current?.focus())
    }
    window.addEventListener('keydown', focus)
    return () => window.removeEventListener('keydown', focus)
  }, [rail, expand])
  const toggle = (key: string) => setCollapsed((old) => {
    const next = new Set(old)
    if (next.has(key)) next.delete(key); else next.add(key)
    localStorage.setItem(`mnemo.refs.collapsed:${path}`, JSON.stringify([...next]))
    return next
  })
  const vis = useVisibility(selectVisibility(path))
  const pinned = refs ? pinnedRows(refs, vis.pinned) : []
  const rows = refs && !rail ? visibleRows(refs, collapsed, query, pinned) : []
  const sectionCounts = refs ? counts(refs, pinned.length) : null
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current,
    estimateSize: () => ROW_HEIGHT, overscan: 10, getItemKey: (index) => rows[index]!.key })
  const checkout = (row: Row) => {
    if (row.type === 'local' && !row.ref.current) void actions.checkoutRef(path, { type: 'checkout', target: row.ref.name })
    if (row.type === 'remote') {
      const local = refs?.local.find((b) => b.name === row.ref.name)
      if (local) void actions.checkoutRef(path, { type: 'checkout', target: local.name }, local.upstream === `${row.ref.remote}/${row.ref.name}` ? (local.behind ?? 0) : 0)
      else void actions.checkoutRef(path, { type: 'checkoutRemote', remote: row.ref.remote, branch: row.ref.name })
    }
  }
  const viewOf = (row: Row) => ({ hidden: vis.hidden.includes(refName(row)), solo: vis.solo === refName(row), pinned: vis.pinned.includes(refName(row)) })
  const targetOf = (row: Row): BranchTarget | null =>
    row.type === 'local' ? { kind: 'local', ref: row.ref }
      : row.type === 'remote' ? { kind: 'remote', ref: row.ref, local: refs?.local.find((b) => b.name === row.ref.name) } : null
  const entries = (row: Row, target: BranchTarget, remoteUrl: string | null) => branchMenu(target, {
    head: head!, toolbar: toolbar!, remoteUrl, mutation: toolbarAvailability(head!, toolbar!, running).mutation,
    execute: (kind) => void actions.execute(path, kind), checkout: () => checkout(row), pull: () => void actions.pullNow(path),
    push: () => void actions.requestPush(path), newBranch: (start) => actions.setPalette('createBranch', start),
    resetHard: (sha) => void actions.requestResetHard(path, sha), dialog: setDialog,
    copy: (text) => void navigator.clipboard.writeText(text).catch(() => undefined),
    view: viewOf(row), toggleView: (what) => updateVisibility(path, (v) => ({ hidden: toggleHidden, solo: toggleSolo, pinned: togglePinned })[what](v, refName(row))),
  })
  const openMenu = async (row: Row, anchor: Rect) => {
    const target = targetOf(row)
    if (!target || !head || !toolbar) return
    setSelected(row.key)
    const remote = remoteOf(target, toolbar.remotes)
    const url = remote ? await core.remoteUrl(path, remote.remote).catch(() => null) : null
    setMenu({ items: entries(row, target, url), anchor })
  }
  const shortcut = (e: React.KeyboardEvent) => {
    const row = rows.find((r) => r.key === selected)
    const target = row && head && toolbar && !(e.target instanceof HTMLInputElement) ? targetOf(row) : null
    const item = target && entries(row!, target, null).find((i) => i !== '-' && i.shortcut && matchesShortcut(i.shortcut, e.nativeEvent))
    if (item && item !== '-' && !item.reason) { e.preventDefault(); item.run?.() }
  }
  if (rail) return <div className="refs-rail" aria-label="Seções de refs">
    {sectionCounts && (Object.keys(LABEL) as Section[]).filter((s) => sectionCounts[s]).map((s) =>
      <button key={s} title={`${LABEL[s]} (${sectionCounts[s]})`} aria-label={`${LABEL[s]}: ${sectionCounts[s]}`} onClick={expand}>
        <span>{ICON[s]}</span><small>{sectionCounts[s]}</small>
      </button>)}
  </div>
  return <div className="refs-panel" onKeyDown={shortcut}>
    <div className="refs-heading"><strong>Refs</strong><button aria-label="Filtrar refs" title="Filtrar refs (Ctrl+Alt+F)" onClick={() => input.current?.focus()}>⌕</button></div>
    <input ref={input} className="refs-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar refs…" aria-label="Filtrar refs" />
    <div className="refs-scroll" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) return null
          const open = !collapsed.has(row.type === 'section' ? row.section : row.key)
          const point = (e: React.MouseEvent) => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY })
          return <div key={row.key} className="refs-virtual-row" style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }}
            onContextMenu={(e) => { if (!targetOf(row)) return; e.preventDefault(); void openMenu(row, point(e)) }}>
            {row.type === 'section' || row.type === 'folder'
              ? <button className={`refs-row refs-group depth-${row.type === 'folder' ? row.depth : 0}`} onClick={() => toggle(row.type === 'section' ? row.section : row.key)}
                  aria-expanded={open} title={row.type === 'section' ? row.label : row.name}>
                  <span className="refs-chevron">{open ? '▾' : '▸'}</span><span className="refs-label">{row.type === 'section' ? row.label : row.name}</span><span className="refs-count">{row.count}</span>
                </button>
              : <button className={`refs-row refs-item depth-${row.depth}${selected === row.key ? ' selected' : ''}${row.type === 'local' && row.ref.current ? ' current' : ''}`}
                  title={row.type === 'remote' ? `${row.ref.remote}/${row.ref.name}` : row.type === 'local' ? row.ref.name : row.name}
                  onClick={() => {
                    setSelected(row.key)
                    if (row.type === 'local' || (row.type === 'remote' && row.ref.localExists)) actions.selectCommit(row.ref.sha)
                    else if (row.type === 'plain' && row.section === 'tags' && row.sha) actions.selectCommit(row.sha)
                  }} onDoubleClick={() => checkout(row)}>
                  <span className="refs-symbol">{row.type === 'local' && row.ref.current ? '✓' : row.type === 'remote' ? '☁' : '⑂'}</span>
                  <span className="refs-label">{row.type === 'remote' ? row.ref.name.split('/').at(-1) : row.type === 'local' ? row.ref.name : row.name}</span>
                  {row.type === 'local' && row.ref.upstream && <span className="refs-tracking" title={`Upstream: ${row.ref.upstream}`}>↓{row.ref.behind} ↑{row.ref.ahead}</span>}
                </button>}
            {(row.type === 'local' || row.type === 'remote') && <>
              <button className={`refs-eye${vis.hidden.includes(refName(row)) ? ' off' : ''}${vis.solo === refName(row) ? ' solo' : ''}`}
                aria-pressed={!vis.hidden.includes(refName(row))} aria-label={vis.hidden.includes(refName(row)) ? 'Mostrar no grafo' : 'Ocultar no grafo'}
                title={vis.hidden.includes(refName(row)) ? 'Mostrar no grafo' : 'Ocultar no grafo'}
                onClick={() => updateVisibility(path, (v) => toggleHidden(v, refName(row)))}>{vis.hidden.includes(refName(row)) ? '◌' : '◉'}</button>
              <button className="refs-more" aria-label="Menu da branch" title="Menu da branch"
                onClick={(e) => void openMenu(row, e.currentTarget.getBoundingClientRect())}>⋮</button>
            </>}
          </div>
        })}
      </div>
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu da branch" onClose={() => setMenu(null)} />}
    {dialog && <BranchDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
