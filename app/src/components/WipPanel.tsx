import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import { core } from '../bridge'
import type { FileChange, WipStatus } from '../bridge/types'
import { actions, selectActiveTab, useApp } from '../store/app'

const GLYPH: Record<string, { icon: string; color: string }> = {
  A: { icon: '+', color: '#7FDC95' }, M: { icon: '✎', color: '#F0C06A' }, T: { icon: '✎', color: '#F0C06A' },
  D: { icon: '−', color: '#F0877F' }, R: { icon: '→', color: '#7FB0F0' }, C: { icon: '⧉', color: '#7FB0F0' },
}
type Row = { type: 'head'; key: string; staged: boolean; count: number } | { type: 'file'; key: string; staged: boolean; file: FileChange }
const SUMMARY_LIMIT = 72
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

const Svg = ({ size = 14, children }: { size?: number; children: ReactNode }) =>
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">{children}</svg>

/** Painel direito com o nó WIP selecionado (WIP.dc.html): preparar, tirar, commitar. */
export function WipPanel({ path }: { path: string }) {
  const revision = useApp((s) => s.graphRevision[path.replace(/\\/g, '/').toLowerCase()] ?? s.graphRevision[path.replace(/\\/g, '/')] ?? 0)
  const branch = useApp((s) => { const head = selectActiveTab(s)?.head; return head?.kind === 'branch' ? head.name : 'HEAD' })
  const [status, setStatus] = useState<WipStatus>({ unstaged: [], staged: [] })
  const [reload, setReload] = useState(0)
  const [view, setView] = useState<'path' | 'tree'>('path')
  const [tab, setTab] = useState<'commit' | 'stash'>('commit')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void core.wipStatus(path).then((next) => active && setStatus(next), (err) => active && actions.reportError(err))
    return () => { active = false }
  }, [path, revision, reload])

  const stage = (paths: string[], on: boolean) => void core.stage(path, paths, on).then(() => setReload((n) => n + 1), actions.reportError)
  const { unstaged, staged } = status
  const rows: Row[] = [
    { type: 'head', key: 'h:u', staged: false, count: unstaged.length },
    ...unstaged.map((file): Row => ({ type: 'file', key: `u:${file.path}`, staged: false, file })),
    { type: 'head', key: 'h:s', staged: true, count: staged.length },
    ...staged.map((file): Row => ({ type: 'file', key: `s:${file.path}`, staged: true, file })),
  ]
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 10,
    estimateSize: (i) => (rows[i]!.type === 'head' ? 32 : 28), getItemKey: (i) => rows[i]!.key })

  const changed = new Set([...unstaged, ...staged].map((f) => f.path)).size
  const why = !staged.length && !amend ? 'Prepare arquivos para commitar' : !summary.trim() && !amend ? 'Escreva um resumo' : null
  const commit = () => {
    if (why) return
    const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
    void actions.execute(path, { type: 'commit', message, amend, allowEmpty: false })
    setSummary(''); setDescription(''); setAmend(false)
  }
  const stash = () => {
    void actions.execute(path, { type: 'stashCreate', message: summary.trim() || null, includeUntracked: true })
    setSummary('')
  }

  return <div className="wip-panel" onKeyDown={(e) => {
    if (e.ctrlKey && e.key === 'Enter') { e.preventDefault(); if (tab === 'commit') commit(); else stash() }
  }}>
    <div className="wip-head">
      <span className="wip-title">{plural(changed, 'arquivo alterado', 'arquivos alterados')} em</span>
      <span className="wip-branch">{branch}</span>
      <div style={{ flex: 1 }} />
      <button className="wip-danger" disabled={!changed} title="Descartar todas as mudanças (pede confirmação)" aria-label="Descartar todas as mudanças"
        onClick={() => void actions.requestDiscard(path, [])}><Svg><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></Svg></button>
    </div>
    <div className="wip-tools">
      <div role="group" aria-label="Exibição dos arquivos" className="wip-seg">
        <button aria-pressed={view === 'path'} onClick={() => setView('path')}>Caminho</button>
        <button aria-pressed={view === 'tree'} onClick={() => setView('tree')}>Árvore</button>
      </div>
      <button className="wip-icon" aria-label="Ordenar arquivos"><Svg><path d="M7 4v16M3 16l4 4 4-4M14 6h7M14 12h5M14 18h3" /></Svg></button>
    </div>
    <div className="wip-files" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]!
          const style = { transform: `translateY(${item.start}px)`, height: item.size }
          if (row.type === 'head') {
            return <div key={row.key} className={row.staged ? 'wip-section staged' : 'wip-section'} style={style}>
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#8A877F" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg>
              <span className="wip-section-name">{row.staged ? 'Preparados' : 'Não preparados'} <span>{row.count}</span></span>
              <button className={row.staged ? 'wip-ghost' : 'wip-neutral'} disabled={!row.count} onClick={() => stage([], !row.staged)}>{row.staged ? 'Tirar todos' : 'Preparar todos'}</button>
            </div>
          }
          const { file } = row
          const g = GLYPH[file.status] ?? GLYPH.M!
          const i = file.path.lastIndexOf('/')
          return <div key={row.key} className="wip-file" style={style} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}>
            <span className="wip-glyph" style={{ color: g.color }}>{g.icon}</span>
            <span className="wip-path"><span className="wip-dir">{file.path.slice(0, i + 1)}</span><span className="wip-name">{file.path.slice(i + 1)}</span></span>
            {file.added !== null && <span className="wip-lines"><span style={{ color: '#7FDC95' }}>+{file.added}</span> <span style={{ color: '#F0877F' }}>−{file.removed}</span></span>}
            <span className="wip-actions">
              {!row.staged && <button className="wip-danger" title="Descartar mudanças deste arquivo" aria-label={`Descartar ${file.path}`}
                onClick={() => void actions.requestDiscard(path, [file.path])}><Svg size={13}><path d="M9 14L4 9l5-5" /><path d="M4 9h10a6 6 0 0 1 0 12h-3" /></Svg></button>}
              <button className={row.staged ? 'wip-ghost small' : 'wip-stage'} onClick={() => stage([file.path], !row.staged)}>{row.staged ? 'Tirar' : 'Preparar'}</button>
            </span>
          </div>
        })}
      </div>
    </div>
    <div className="wip-compose">
      <div role="tablist" aria-label="Ação" className="wip-tabs">
        <button role="tab" aria-selected={tab === 'commit'} onClick={() => setTab('commit')}>
          <Svg><circle cx="12" cy="12" r="3.5" /><path d="M3 12h5.5M15.5 12H21" /></Svg>Commit</button>
        <button role="tab" aria-selected={tab === 'stash'} onClick={() => setTab('stash')}>
          <Svg><path d="M4 13h4l2 3h4l2-3h4" /><path d="M4 13l2-8h12l2 8v6H4z" /></Svg>Stash</button>
      </div>
      {tab === 'commit' && <label className="wip-amend"><input type="checkbox" checked={amend} onChange={(e) => setAmend(e.target.checked)} /> Emendar o último commit (amend)</label>}
      <div className="wip-box">
        <div className="wip-summary">
          <label htmlFor="wip-sum" className="sr-only">Resumo</label>
          <input id="wip-sum" type="text" value={summary} placeholder={tab === 'commit' ? 'Resumo' : 'Mensagem do stash (opcional)'} onChange={(e) => setSummary(e.target.value)} />
          {tab === 'commit' && <span title="Limite recomendado de 72 caracteres" className="wip-count" style={summary.length > SUMMARY_LIMIT ? { color: '#F0C06A' } : undefined}>{summary.length}/{SUMMARY_LIMIT}</span>}
        </div>
        {tab === 'commit' && <>
          <label htmlFor="wip-desc" className="sr-only">Descrição</label>
          <textarea id="wip-desc" rows={3} placeholder="Descrição (opcional)" value={description} onChange={(e) => setDescription(e.target.value)} />
        </>}
      </div>
      {tab === 'commit' && <button className="wip-options" type="button">
        <Svg size={12}><path d="M9 6l6 6-6 6" /></Svg>Opções<span>· assinar: não · hooks: sim · push depois: não</span></button>}
      <div className="wip-buttons">
        {tab === 'commit'
          ? <button className="wip-commit" disabled={!!why} title={why ?? undefined} onClick={commit}>
              {why ?? (staged.length ? `Commitar ${plural(staged.length, 'arquivo', 'arquivos')} em ${branch}` : `Emendar o último commit em ${branch}`)}
              {!why && <kbd>Ctrl Enter</kbd>}</button>
          : <button className="wip-commit" disabled={!changed} title={changed ? undefined : 'Não há mudanças para guardar'} onClick={stash}>
              Guardar {plural(changed, 'arquivo', 'arquivos')} no stash<kbd>Ctrl Enter</kbd></button>}
      </div>
      {tab === 'commit' && unstaged.length > 0 && staged.length > 0 &&
        <p>{unstaged.length === 1 ? '1 arquivo não preparado fica' : `${unstaged.length} arquivos não preparados ficam`} de fora deste commit.</p>}
    </div>
  </div>
}
