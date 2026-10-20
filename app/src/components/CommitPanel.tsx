import { useVirtualizer } from '@tanstack/react-virtual'
import { Segmented, FILE_VIEWS } from './Segmented'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { CommitDetail, FileChange } from '../bridge/types'
import { actions, selectDiff, selectSha, useApp } from '../store/app'
import { Avatar } from './avatar'
import { dirMenu, fileMenu, type CommitDialog } from './commitMenu'
import { CommitDialogs } from './CommitDialogs'
import { Menu } from './Menu'
import { copyText, menuBase } from './menuBase'
import { fileRows } from './fileTree'
import type { MenuEntry, Rect } from './menuModel'
import { Icon, type IconName } from './Icon'

type View = 'path' | 'tree'
type Sort = 'path' | 'status'

const ROW_HEIGHT = 26
const STATUS: Record<FileChange['status'], { icon: IconName; cls: string; label: string }> = {
  A: { icon: 'plus', cls: 'added', label: 'adicionado' }, M: { icon: 'modified', cls: 'modified', label: 'modificado' },
  D: { icon: 'minus', cls: 'removed', label: 'removido' }, R: { icon: 'renamed', cls: 'renamed', label: 'renomeado' },
  C: { icon: 'copy', cls: 'renamed', label: 'copiado' }, T: { icon: 'modified', cls: 'modified', label: 'tipo alterado' },
  U: { icon: 'unchanged', cls: 'plain', label: 'sem mudança' },
}
const STATUS_ORDER = 'AMDRCTU'

function sorted(files: FileChange[], sort: Sort) {
  return [...files].sort((a, b) => (sort === 'status' ? STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status) : 0)
    || a.path.localeCompare(b.path))
}

function summary(files: FileChange[]) {
  const n = (s: string) => files.filter((f) => f.status === s).length
  return ([
    { cls: 'modified', icon: 'modified', n: n('M') + n('T'), label: 'modificados' }, { cls: 'added', icon: 'plus', n: n('A') + n('C'), label: 'adicionados' },
    { cls: 'removed', icon: 'minus', n: n('D'), label: 'removidos' }, { cls: 'renamed', icon: 'renamed', n: n('R'), label: 'renomeados' },
  ] satisfies { cls: string; icon: IconName; n: number; label: string }[]).filter((s) => s.n)
}

export function CommitPanel({ path }: { path: string }) {
  const sha = useApp((s) => { const v = selectSha(path)(s); return v === 'wip' ? null : v })
  const opened = useApp((s) => { const d = selectDiff(path)(s); return d?.source.kind === 'commit' ? d.file.path : null })
  const [detail, setDetail] = useState<CommitDetail | null>(null)
  const [draft, setDraft] = useState({ subject: '', body: '' })
  const [all, setAll] = useState(false)
  const [view, setView] = useState<View>('path')
  const [sort, setSort] = useState<Sort>('path')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [copied, setCopied] = useState(false)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<CommitDialog | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const copyRestore = (cmd: string) => {
    copyText(cmd)
    if (sha) void core.commitOnRemote(path, sha).then((on) => { if (!on) actions.info('Este commit só existe no seu repositório local (ainda não foi enviado ao remoto). Quem receber o comando precisa que você dê push antes.', path) }, () => {})
  }
  const openMenu = async (file: FileChange, anchor: Rect) => {
    if (!sha) return
    const base = await menuBase(path)
    if (!base) return
    const sep = path.includes('\\') ? '\\' : '/'
    setMenu({ anchor, items: fileMenu(sha, file, {
      ...base, dialog: setDialog, copyRestore, absolute: `${path.replace(/[\\/]$/, '')}${sep}${file.path.replaceAll('/', sep)}`,
      open: (how) => void core.openFile(path, file.path, how).catch((err) => actions.reportError(err, path)),
    }) })
  }
  const openDirMenu = (dir: string, anchor: Rect) => { if (sha) setMenu({ anchor, items: dirMenu(sha, dir, { copyRestore }) }) }
  useEffect(() => {
    if (!sha) { setDetail(null); return }
    let active = true
    void core.commitDetail(path, sha, all).then((next) => {
      if (!active) return
      setDetail(next); setCollapsed(new Set()); setDraft({ subject: next.subject, body: next.body })
    }, (err) => { if (active) { setDetail(null); actions.reportError(err, path) } })
    return () => { active = false }
  }, [path, sha, all])
  const rows = detail ? fileRows(sorted(detail.files, sort), view, collapsed) : []
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT,
    overscan: 10, getItemKey: (index) => rows[index]!.key })
  if (!sha || !detail) return <div className="commit-panel commit-empty">{sha ? 'Carregando…' : 'Selecione um commit no grafo.'}</div>
  const dirty = draft.subject.trim() !== detail.subject.trim() || draft.body.trim() !== detail.body.trim()
  const update = async () => {
    const subject = draft.subject.trim()
    if (!subject) return
    const wasHead = (await core.commitDetail(path, 'HEAD', false).catch(() => null))?.sha === detail.sha
    await actions.execute(path, { type: 'reword', commit: detail.sha, message: draft.body.trim() ? `${subject}\n\n${draft.body.trim()}` : subject })
    // o hash muda (e o dos descendentes): acompanha o HEAD; um commit mais antigo deixa de existir e a seleção vai para o WIP
    const head = await core.commitDetail(path, 'HEAD', false).catch(() => null)
    const gone = await core.commitDetail(path, detail.sha, false).then(() => false, () => true)
    if (gone) actions.selectCommit(path, wasHead && head ? head.sha : 'wip')
  }
  const openDiff = (file: FileChange) => actions.openDiff({ path, file, source: { kind: 'commit', sha: detail.sha, oldPath: file.oldPath } })
  const copy = () => { void navigator.clipboard.writeText(detail.sha).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1200) }, () => {}) }
  return <div className="commit-panel">
    <div className="commit-head">
      <div className="commit-sha"><code title={detail.sha}>{detail.sha.slice(0, 10)}</code>
        <button onClick={copy} aria-label="Copiar SHA" title="Copiar SHA">{copied ? 'Copiado' : <Icon name="copy" size={13} />}</button></div>
      <div className="commit-msg">
        <input className="commit-subject" aria-label="Título do commit" value={draft.subject}
          onChange={(e) => setDraft({ ...draft, subject: e.target.value })} />
        <textarea className="commit-body" aria-label="Descrição do commit" placeholder="Descrição" value={draft.body}
          onChange={(e) => setDraft({ ...draft, body: e.target.value })} />
      </div>
      <div className="commit-msg-actions">
        <button className="wip-commit" disabled={!dirty || !draft.subject.trim()} onClick={() => void update()}>Atualizar mensagem</button>
        <button className="commit-msg-cancel" disabled={!dirty} onClick={() => setDraft({ subject: detail.subject, body: detail.body })}>Cancelar</button>
      </div>
      <div className="commit-author">
        <Avatar name={detail.author} email={detail.email} />
        <div><div>{detail.author}</div><div className="muted">criou em {new Date(detail.timestamp * 1000).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}</div></div>
        {detail.parents.length > 0 && <div className="commit-parents"><span className="muted">{detail.parents.length > 1 ? 'pais' : 'pai'}</span>
          <span>{detail.parents.map((p, i) => <span key={p}>{i > 0 && ' · '}<a href="#" onClick={(e) => { e.preventDefault(); actions.selectCommit(path, p) }}>{p.slice(0, 6)}</a></span>)}</span></div>}
      </div>
    </div>
    <div className="commit-summary">
      {summary(detail.files.filter((f) => f.status !== 'U')).map((s) => <span key={s.cls} className={`chip ${s.cls}`}><Icon name={s.icon} size={12} strokeWidth={2.2} /> {s.n} {s.label}</span>)}
      <span className="spacer" /><span className="mono"><span className="added">+{detail.added}</span> <span className="removed">−{detail.removed}</span></span>
    </div>
    <div className="commit-tools">
      <Segmented label="Exibição dos arquivos" options={FILE_VIEWS} value={view} onChange={setView} />
      <button aria-label="Ordenar arquivos" title={`Ordenado por ${sort === 'path' ? 'caminho' : 'status'}`} onClick={() => setSort(sort === 'path' ? 'status' : 'path')}><Icon name="sort" size={13} /> {sort === 'path' ? 'Caminho' : 'Status'}</button>
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
              onContextMenu={(e) => { e.preventDefault(); openDirMenu(row.path, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }}
              onClick={() => setCollapsed((old) => { const next = new Set(old); if (open) next.add(row.key); else next.delete(row.key); return next })}>
              <span className={`refs-chevron${open ? ' open' : ''}`}><Icon name="chevron" size={14} /></span><span className="commit-name">{row.name}</span><span className="refs-count">{row.count}</span></button>
          }
          const st = STATUS[row.file.status]
          const title = row.file.oldPath ? `${row.file.oldPath} → ${row.file.path}` : row.file.path
          return <div key={row.key} className={opened === row.file.path ? 'commit-file active' : 'commit-file'} style={style} title={`${title} (${st.label})`}
            role="button" tabIndex={0} onClick={() => openDiff(row.file)}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openDiff(row.file) } }}
            onContextMenu={(e) => { e.preventDefault(); void openMenu(row.file, { left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY }) }}>
            <span className={`commit-status ${st.cls}`}><Icon name={st.icon} size={12} strokeWidth={2.2} /></span>
            <span className="commit-path"><span className="commit-dirpath">{row.dir}</span><span className="commit-name">{row.name}</span></span>
            {row.file.added !== null && row.file.status !== 'U' && <span className="mono commit-lines"><span className="added">+{row.file.added}</span> <span className="removed">−{row.file.removed}</span></span>}
            <button className="refs-more" aria-label="Menu do arquivo" title="Menu do arquivo"
              onClick={(e) => { e.stopPropagation(); void openMenu(row.file, e.currentTarget.getBoundingClientRect()) }}><Icon name="more" size={14} /></button>
          </div>
        })}
      </div>
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu do arquivo" onClose={() => setMenu(null)} />}
    {dialog && <CommitDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </div>
}
