import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { LocalRef, RefListing, RemoteRef } from '../bridge/types'
import { actions, isActiveTab, runningLabel, useApp } from '../store/app'
import { localRef, remoteRef, selectVisibility, toggleHidden, updateVisibility, useVisibility } from '../store/visibility'
import type { BranchTarget } from './branchMenu'
import { Menu } from './Menu'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import { Icon, type IconName } from './Icon'
import { StashApplyDialog } from './StashApplyDialog'
import { useBranchActions } from './useBranchActions'

type Section = 'local' | 'remotes' | 'worktrees' | 'stashes' | 'tags' | 'submodules'
type Row =
  | { type: 'section'; key: string; section: Section; label: string; count: number }
  | { type: 'folder'; key: string; name: string; count: number; depth: number }
  | { type: 'local'; key: string; ref: LocalRef; depth: number }
  | { type: 'remote'; key: string; ref: RemoteRef; depth: number }
  | { type: 'plain'; key: string; section: Section; name: string; sha?: string; depth: number }

const LABEL: Record<Section, string> = {
  local: 'Local', remotes: 'Remotos', worktrees: 'Worktrees', stashes: 'Stashes', tags: 'Tags', submodules: 'Submódulos',
}
const ICON: Record<Section, IconName> = {
  local: 'laptop', remotes: 'cloud', worktrees: 'worktrees', stashes: 'stashes', tags: 'tags', submodules: 'submodules',
}
const SECTION_HEIGHT = 36
const ROW_HEIGHT = 30

/** Ref completa de uma linha de branch (a chave da visibilidade); linhas sem branch nunca chegam aqui. */
function refName(row: Row): string {
  return row.type === 'local' ? localRef(row.ref.name) : row.type === 'remote' ? remoteRef(row.ref.remote, row.ref.name) : row.key
}

function counts(refs: RefListing): Record<Section, number> {
  return {
    local: refs.local.length,
    remotes: refs.remotes.reduce((sum, group) => sum + group.branches.length + group.folders.reduce((n, f) => n + f.branches.length, 0), 0),
    worktrees: refs.worktrees.length,
    stashes: refs.stashes.length,
    tags: refs.tags.length,
    submodules: refs.submodules.length,
  }
}

function visibleRows(refs: RefListing, collapsed: Set<string>, query: string): Row[] {
  const q = query.trim().toLocaleLowerCase()
  const include = (name: string) => !q || name.toLocaleLowerCase().includes(q)
  const result: Row[] = []
  const count = counts(refs)
  const section = (key: Section, add: () => void) => {
    if (!count[key]) return
    const start = result.length
    result.push({ type: 'section', key: `section:${key}`, section: key, label: LABEL[key], count: count[key] })
    if (!collapsed.has(key) || q) add()
    if (q && result.length === start + 1) result.pop()
  }
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
export function RefPanel({ path, rail, expand, collapse }: { path: string; rail: boolean; expand: () => void; collapse: () => void }) {
  const [refs, setRefs] = useState<RefListing | null>(null)
  const [collapsed, setCollapsed] = useState(() => loadCollapsed(path))
  const [query, setQuery] = useState('')
  const [selected, setSelected] = useState<string | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const running = useApp((s) => runningLabel(s, path))
  const undo = useApp((s) => s.tabs.find((t) => t.path === path)?.undo)
  const doubleClickCheckout = useApp((s) => s.prefs.doubleClickCheckout)
  const branch = useBranchActions(path)
  const [stashMenu, setStashMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [stashApply, setStashApply] = useState<{ index: number; name: string } | null>(null)
  const openStashMenu = (name: string, anchor: Rect) => {
    const index = Number(/^stash@\{(\d+)\}/.exec(name)?.[1] ?? -1)
    if (index < 0) return
    const label = `stash@{${index}}`
    setStashMenu({ anchor, items: [
      { label: name, heading: true },
      { label: `Aplicar ${label}`, run: () => void actions.execute(path, { type: 'stashApply', index }) },
      { label: `Pop de ${label}`, run: () => void actions.execute(path, { type: 'stashPop', index }) },
      { label: 'Aplicar arquivos do stash…', run: () => setStashApply({ index, name: label }) },
    ] })
  }
  useEffect(() => {
    if (running) return
    let active = true
    void core.listRefs(path).then((next) => { if (active) setRefs(next) }, (err) => { if (active) actions.reportError(err, path) })
    return () => { active = false }
  }, [path, running, undo])
  useEffect(() => {
    const focus = (e: KeyboardEvent) => {
      if (!isActiveTab(path) || !(e.ctrlKey && e.altKey && e.key.toLowerCase() === 'f')) return
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
  const rows = refs && !rail ? visibleRows(refs, collapsed, query) : []
  const sectionCounts = refs ? counts(refs) : null
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current,
    estimateSize: (index) => rows[index]?.type === 'section' ? SECTION_HEIGHT : ROW_HEIGHT, overscan: 10, getItemKey: (index) => rows[index]!.key })
  const checkout = (row: Row) => {
    const target = targetOf(row)
    if (target) branch.checkout(target)
  }
  const targetOf = (row: Row): BranchTarget | null =>
    row.type === 'local' ? { kind: 'local', ref: row.ref }
      : row.type === 'remote' ? { kind: 'remote', ref: row.ref, local: refs?.local.find((b) => b.name === row.ref.name) } : null
  const openMenu = (row: Row, anchor: Rect) => {
    const target = targetOf(row)
    if (!target || !branch.ready) return
    setSelected(row.key)
    void branch.open(target, anchor)
  }
  const shortcut = (e: React.KeyboardEvent) => {
    const row = rows.find((r) => r.key === selected)
    const target = row && branch.ready && !(e.target instanceof HTMLInputElement) ? targetOf(row) : null
    const item = target && branch.entries(target, null).find((i) => i !== '-' && i.shortcut && matchesShortcut(i.shortcut, e.nativeEvent))
    if (item && item !== '-' && !item.reason) { e.preventDefault(); item.run?.() }
  }
  if (rail) return <div className="refs-rail" aria-label="Seções de refs">
    {sectionCounts && (Object.keys(LABEL) as Section[]).filter((s) => sectionCounts[s]).map((s) =>
      <button key={s} title={`${LABEL[s]} (${sectionCounts[s]})`} aria-label={`${LABEL[s]}: ${sectionCounts[s]}`} onClick={expand}>
        <Icon name={ICON[s]} size={16} /><small>{sectionCounts[s]}</small>
      </button>)}
  </div>
  return <div className="refs-panel" onKeyDown={shortcut}>
    <div className="refs-heading">
      <label className="refs-search">
        <Icon name="search" size={16} />
        <input ref={input} className="refs-filter" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Filtrar refs" aria-label="Filtrar refs" />
        <kbd>Ctrl Alt F</kbd>
      </label>
      <button className="refs-collapse" aria-label="Recolher painel de refs" title="Recolher painel de refs" onClick={collapse}><Icon name="collapse" size={18} /></button>
    </div>
    <div className="refs-scroll" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) return null
          const open = !collapsed.has(row.type === 'section' ? row.section : row.key)
          const point = (e: React.MouseEvent) => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY })
          return <div key={row.key} className="refs-virtual-row" style={{ transform: `translateY(${item.start}px)`, height: item.size }}
            onContextMenu={(e) => {
              if (row.type === 'plain' && row.section === 'stashes') { e.preventDefault(); openStashMenu(row.name, point(e)); return }
              if (!targetOf(row)) return; e.preventDefault(); openMenu(row, point(e))
            }}>
            {row.type === 'section' || row.type === 'folder'
              ? <button className={`refs-row refs-group ${row.type === 'section' ? 'refs-section depth-0' : `refs-folder depth-${row.depth}`}`} onClick={() => toggle(row.type === 'section' ? row.section : row.key)}
                  aria-expanded={open} title={row.type === 'section' ? row.label : row.name}>
                  <span className={`refs-chevron${open ? ' open' : ''}`}><Icon name="chevron" size={14} /></span>
                  {row.type === 'section' ? <Icon name={ICON[row.section]} size={16} /> : row.depth > 1 && <Icon name="folder" size={16} />}
                  <span className="refs-label">{row.type === 'section' ? row.label : row.name}</span>
                  {(row.type === 'section' || row.depth > 1) && <span className="refs-count">{row.count.toLocaleString('pt-BR')}</span>}
                </button>
              : <button className={`refs-row refs-item depth-${row.depth}${selected === row.key ? ' selected' : ''}${row.type === 'local' && row.ref.current ? ' current' : ''}`}
                  title={row.type === 'remote' ? `${row.ref.remote}/${row.ref.name}` : row.type === 'local' ? row.ref.name : row.name}
                  onClick={() => {
                    setSelected(row.key)
                    if (row.type === 'local' || row.type === 'remote') actions.selectCommit(path, row.ref.sha)
                    else if (row.type === 'plain' && row.section === 'tags' && row.sha) actions.selectCommit(path, row.sha)
                  }} onDoubleClick={() => { if (doubleClickCheckout) checkout(row) }}>
                  <span className="refs-symbol"><Icon name={row.type === 'local' && row.ref.current ? 'check' : row.type === 'plain' ? ICON[row.section] : 'branch'} /></span>
                  <span className="refs-label">{row.type === 'remote' ? row.ref.name.split('/').at(-1) : row.type === 'local' ? row.ref.name : row.name}</span>
                  {(row.type === 'local' || row.type === 'remote') && vis.highlight === refName(row) && <span className="refs-highlight" title="Branch em destaque"><Icon name="highlight" size={12} /></span>}
                  {row.type === 'local' && row.ref.upstream && <span className="refs-tracking" title={`Upstream: ${row.ref.upstream}`}>
                    {!!row.ref.behind && <span><Icon name="arrowDown" size={11} strokeWidth={2.2} />{row.ref.behind}</span>}{!!row.ref.ahead && <span><Icon name="arrowUp" size={11} strokeWidth={2.2} />{row.ref.ahead}</span>}</span>}
                </button>}
            {row.type === 'plain' && row.section === 'stashes' && <button className="refs-more" aria-label="Menu do stash" title="Menu do stash"
              onClick={(e) => openStashMenu(row.name, e.currentTarget.getBoundingClientRect())}><Icon name="more" size={14} /></button>}
            {(row.type === 'local' || row.type === 'remote') && <>
              <button className={`refs-eye${vis.hidden.includes(refName(row)) ? ' off' : ''}${vis.solo === refName(row) ? ' solo' : ''}`}
                aria-pressed={!vis.hidden.includes(refName(row))} aria-label={vis.hidden.includes(refName(row)) ? 'Mostrar no grafo' : 'Ocultar no grafo'}
                title={vis.hidden.includes(refName(row)) ? 'Mostrar no grafo' : 'Ocultar no grafo'}
                onClick={() => updateVisibility(path, (v) => toggleHidden(v, refName(row)))}><Icon name={vis.hidden.includes(refName(row)) ? 'hidden' : 'shown'} size={14} /></button>
              <button className="refs-more" aria-label="Menu da branch" title="Menu da branch"
                onClick={(e) => openMenu(row, e.currentTarget.getBoundingClientRect())}><Icon name="more" size={14} /></button>
            </>}
          </div>
        })}
      </div>
    </div>
    {branch.overlay}
    {stashMenu && <Menu items={stashMenu.items} anchor={stashMenu.anchor} label="Menu do stash" onClose={() => setStashMenu(null)} />}
    {stashApply && <StashApplyDialog path={path} index={stashApply.index} name={stashApply.name} close={() => setStashApply(null)} />}
  </div>
}
