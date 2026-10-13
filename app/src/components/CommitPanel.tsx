import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { CommitDetail, FileChange } from '../bridge/types'
import { actions, useApp } from '../store/app'
import { avatarStyle, initials } from './avatar'
import { fileMenu, type CommitDialog } from './commitMenu'
import { CommitDialogs } from './CommitDialogs'
import { Menu } from './Menu'
import { menuBase } from './menuBase'
import type { MenuEntry, Rect } from './menuModel'

type View = 'path' | 'tree'
type Sort = 'path' | 'status'
type Row =
  | { type: 'dir'; key: string; name: string; depth: number; count: number }
  | { type: 'file'; key: string; file: FileChange; dir: string; name: string; depth: number }

const ROW_HEIGHT = 26
const STATUS: Record<FileChange['status'], { icon: string; cls: string; label: string }> = {
  A: { icon: '+', cls: 'added', label: 'adicionado' }, M: { icon: '✎', cls: 'modified', label: 'modificado' },
  D: { icon: '−', cls: 'removed', label: 'removido' }, R: { icon: '→', cls: 'renamed', label: 'renomeado' },
  C: { icon: '⧉', cls: 'renamed', label: 'copiado' }, T: { icon: '✎', cls: 'modified', label: 'tipo alterado' },
  U: { icon: '·', cls: 'plain', label: 'sem mudança' },
}
const STATUS_ORDER = 'AMDRCTU'

function sorted(files: FileChange[], sort: Sort) {
  return [...files].sort((a, b) => (sort === 'status' ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) : 0)
    || a.path.localeCompare(b.path))
}

function rowsFor(files: FileChange[], view: View, sort: Sort, collapsed: Set<string>): Row[] {
  const list = sorted(files, sort)
  const split = (path: string) => { const i = path.lastIndexOf('/'); return { dir: path.slice(0, i + 1), name: path.slice(i + 1) } }
  if (view === 'path') return list.map((file) => ({ type: 'file', key: file.path, file, ...split(file.path), depth: 0 }))
  const rows: Row[] = []
  const seen = new Set<string>()
  for (const file of list) {
    const parts = file.path.split('/')
    let hidden = false
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join('/')
      if (!seen.has(dir)) {
        seen.add(dir)
        if (!hidden) rows.push({ type: 'dir', key: `dir:${dir}`, name: parts[i]!, depth: i, count: list.filter((f) => f.path.startsWith(`${dir}/`)).length })
      }
      if (collapsed.has(`dir:${dir}`)) hidden = true
    }
    if (!hidden) rows.push({ type: 'file', key: file.path, file, dir: '', name: parts.at(-1)!, depth: parts.length - 1 })
  }
  return rows
}

function summary(files: FileChange[]) {
  const n = (s: string) => files.filter((f) => f.status === s).length
  return [
    { cls: 'modified', icon: '✎', n: n('M') + n('T'), label: 'modificados' }, { cls: 'added', icon: '+', n: n('A') + n('C'), label: 'adicionados' },
    { cls: 'removed', icon: '−', n: n('D'), label: 'removidos' }, { cls: 'renamed', icon: '→', n: n('R'), label: 'renomeados' },
  ].filter((s) => s.n)
}

export function CommitPanel({ path }: { path: string }) {
  const sha = useApp((s) => (s.selectedSha === 'wip' ? null : s.selectedSha))
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [all, setAll] = useState(false)
  const [view, setView] = useState<View>('path')
  const [sort, setSort] = useState<Sort>('path')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<CommitDialog | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const openMenu = async (file: FileChange, anchor: Rect) => {
    if (!sha) return
    const base = await menuBase(path)
    if (!base) return
    const sep = path.includes('\\') ? '\\' : '/'
    setMenu({ anchor, items: fileMenu(sha, file, {
      ...base, dialog: setDialog, absolute: `${path.replace(/[\\/]$/, '')}${sep}${file.path.replaceAll('/', sep)}`,
      open: (how) => void core.openFile(path, file.path, how).catch(actions.reportError),
    }) })
  }
  useEffect(() => {
    if (!sha) { setDetail(null); return }
    let active = true
    void core.commitDetail(path, sha, all).then((next) => { if (active) { setDetail(next); setCollapsed(new Set()) } },
      (err) => { if (active) { setDetail(null); actions.reportError(err) } })
    return () => { active = false }
  }, [path, sha, all])
  const rows = detail ? rowsFor(detail.files, view, sort, collapsed) : []
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT,
    overscan: 10, getItemKey: (index) => rows[index]!.key })
  if (!sha || !detail) return <div className="commit-panel commit-empty">{sha ? 'Carregando…' : 'Selecione um commit no grafo.'}</div>
  const copy = () => { void navigator.clipboard.writeText(detail.sha).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }, () => {}) }
  return <div className="commit-panel">
    <div className="commit-head">
      <div className="commit-sha"><code title={detail.sha}>{detail.sha.slice(0, 10)}</code>
        <button onClick={copy} aria-label="Copiar SHA" title="Copiar SHA">{copied ? 'Copiado' : '⧉'}</button></div>
      <h2>{detail.subject}</h2>
      <p className="muted">{detail.body || 'Sem descrição.'}</p>
      <div className="commit-author">
        <span className="avatar" style={avatarStyle(detail.email)}>{initials(detail.author)}</span>
        <div><div>{detail.author}</div><div className="muted">criou em {new Date(detail.timestamp * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
        {detail.parents.length > 0 && <div className="commit-parents"><span className="muted">{detail.parents.length > 1 ? 'pais' : 'pai'}</span>
          <span>{detail.parents.map((p, i) => <span key={p}>{i > 0 && ' · '}<a href="#" onClick={(e) => { e.preventDefault(); actions.selectCommit(p) }}>{p.slice(0, 6)}</a></span>)}</span></div>}
      </div>
    </div>
    <div className="commit-summary">
      {summary(detail.files.filter((f) => f.status !== 'U')).map((s) => <span key={s.cls} className={`chip ${s.cls}`}>{s.icon} {s.n} {s.label}</span>)}
      <span className="spacer" /><span className="mono"><span className="added">+{detail.added}</span> <span className="removed">−{detail.removed}</span></span>
    </div>
    <div className="commit-tools">
      <div role="group" aria-label="Exibição dos arquivos" className="segmented">
        <button aria-pressed={view === 'path'} onClick={() => setView('path')}>Caminho</button>
        <button aria-pressed={view === 'tree'} onClick={() => setView('tree')}>Árvore</button>
      </div>
      <button aria-label="Ordenar arquivos" title={`Ordenado por ${sort === 'path' ? 'caminho' : 'status'}`} onClick={() => setSort(sort === 'path' ? 'status' : 'path')}>⇅ {sort === 'path' ? 'Caminho' : 'Status'}</button>
      <span className="spacer" />
      <label><input type="checkbox" checked={all} onChange={(e) => setAll(e.target.checked)} /> Todos os arquivos</label>
    </div>
    <div className="commit-files" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]
          if (!row) return null
          const style = { transform: `translateY(${item.start}px)`, height: ROW_HEIGHT, paddingLeft: 8 + row.depth * 14 }
          if (row.type === 'dir') {
            const open = !collapsed.has(row.key)
            return <button key={row.key} className="commit-file commit-dir" style={style} aria-expanded={open}
              onClick={() => setCollapsed((old) => { const next = new Set(old); if (open) next.add(row.key); else next.delete(row.key); return next })}>
              <span className="refs-chevron">{open ? '▾' : '▸'}</span><span className="commit-name">{row.name}</span><span className="refs-count">{row.count}</span></button>
          }
          const st = STATUS[row.file.status]
          const title = row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : row.file.path
          return <div key={row.key} className="commit-file" style={style} title={`${title} (${st.label})`}
            onContextMenu={(e) => { e.preventDefault(); void openMenu(row.file, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }}>
            <span className={`commit-status ${st.cls}`}>{st.icon}</span>
            <span className="commit-path"><span className="commit-dirpath">{row.dir}</span><span className="commit-name">{row.name}</span></span>
            {row.file.added !== null && row.file.status !== 'U' && <span className="mono commit-lines"><span className="added">+{row.file.added}</span> <span className="removed">−{row.file.removed}</span></span>}
            <button className="refs-more" aria-label="Menu do arquivo" title="Menu do arquivo"
              onClick={(e) => void openMenu(row.file, e.currentTarget.getBoundingClientRect())}>⋮</button>
          </div>
        })}
      </div>
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu do arquivo" onClose={() => setMenu(null)} />}
    {dialog && <CommitDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
