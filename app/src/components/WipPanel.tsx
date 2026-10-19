import { useVirtualizer } from '@tanstack/react-virtual'
import { Segmented, FILE_VIEWS } from './Segmented'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { core } from '../bridge'
import type { ConflictFile, FileChange, WipStatus } from '../bridge/types'
import { actions, commitOptions, selectDiff, selectRepoPrefs, selectWipRevision, useApp } from '../store/app'
import { fileRows, type TreeRow } from './fileTree'
import { Menu } from './Menu'
import { copyText } from './menuBase'
import type { MenuEntry, Rect } from './menuModel'
import { pickFiles, wipFilesMenu, wipFolderMenu, type WipMenuContext } from './wipMenu'
import { Icon, type IconName } from './Icon'

const GLYPH: Record<string, { icon: IconName; color: string }> = {
  A: { icon: 'plus', color: '#7FDC95' }, M: { icon: 'modified', color: '#F0C06A' }, T: { icon: 'modified', color: '#F0C06A' },
  D: { icon: 'minus', color: '#F0877F' }, R: { icon: 'renamed', color: '#7FB0F0' }, C: { icon: 'copy', color: '#7FB0F0' },
}
type Row = { type: 'head'; key: string; staged: boolean; count: number } | (TreeRow<FileChange> & { staged: boolean })
const SUMMARY_LIMIT = 72
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const point = (e: MouseEvent): Rect => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY })


/** Painel direito com o nó WIP selecionado: preparar, tirar, commitar; seleção múltipla e ações por pasta. */
export function WipPanel({ path }: { path: string }) {
  const revision = useApp(selectWipRevision(path))
  const branch = useApp((s) => { const head = s.tabs.find((t) => t.path === path)?.head; return head?.kind === 'branch' ? head.name : 'HEAD' })
  const opened = useApp((s) => { const d = selectDiff(path)(s); return d && d.source.kind !== 'commit' ? `${d.source.kind === 'staged' ? 's' : 'u'}:${d.file.path}` : null })
  const [status, setStatus] = useState<WipStatus>({ unstaged: [], staged: [] })
  const [conflicts, setConflicts] = useState<ConflictFile[]>([])
  const [view, setView] = useState<'path' | 'tree'>('path')
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const anchor = useRef<string | null>(null)
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [stashAsk, setStashAsk] = useState<string[] | null>(null)
  const [tab, setTab] = useState<'commit' | 'stash'>('commit')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const repoPrefs = useApp(selectRepoPrefs(path))
  const [opts, setOpts] = useState(() => commitOptions(repoPrefs))
  useEffect(() => { void actions.loadRepoPrefs(path) }, [path])
  useEffect(() => { setOpts(commitOptions(repoPrefs)) }, [repoPrefs]) // mudou nas Preferências: vira o novo padrão
  const [optsOpen, setOptsOpen] = useState(false)
  const [busy, setBusy] = useState(false) // hooks podem demorar: trava o botão e mostra o carregando
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void core.wipStatus(path).then((next) => active && setStatus(next), (err) => active && actions.reportError(err))
    void core.conflictList(path).then((next) => active && setConflicts(next), (err) => active && actions.reportError(err))
    return () => { active = false }
  }, [path, revision])

  const stage = (paths: string[], on: boolean) => void core.stage(path, paths, on).then(() => actions.wipChanged(path), actions.reportError)
  const { unstaged, staged } = status
  const rows: Row[] = [
    { type: 'head', key: 'h:u', staged: false, count: unstaged.length },
    ...fileRows(unstaged, view, collapsed, 'u:').map((r): Row => ({ ...r, staged: false })),
    { type: 'head', key: 'h:s', staged: true, count: staged.length },
    ...fileRows(staged, view, collapsed, 's:').map((r): Row => ({ ...r, staged: true })),
  ]
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 10,
    estimateSize: (i) => (rows[i]!.type === 'head' ? 32 : 28), getItemKey: (i) => rows[i]!.key })

  // a seleção só vale para arquivos que ainda existem na seção
  const sectionFiles = (isStaged: boolean) => (isStaged ? staged : unstaged)
  const chosen = (isStaged: boolean) => sectionFiles(isStaged).filter((f) => selected.has(`${isStaged ? 's' : 'u'}:${f.path}`))
  const targets = (row: Extract<Row, { type: 'file' }>) => (selected.has(row.key) ? chosen(row.staged) : [row.file])
  const openDiff = (file: FileChange, isStaged: boolean) => actions.openDiff({ path, file, source: { kind: isStaged ? 'staged' : 'unstaged' } })
  const ctx = (isStaged: boolean): WipMenuContext => ({
    stage, discard: (paths) => void actions.requestDiscard(path, paths), stash: setStashAsk, copy: copyText,
    ignore: (pattern) => void core.ignore(path, pattern).then(() => actions.wipChanged(path), actions.reportError),
    openDiff: (file) => openDiff(file, isStaged),
  })
  const clickFile = (row: Extract<Row, { type: 'file' }>, e: MouseEvent) => {
    const keys = rows.filter((r) => r.type === 'file' && r.staged === row.staged).map((r) => r.key)
    setSelected(pickFiles(selected, anchor.current, row.key, keys, { ctrl: e.ctrlKey || e.metaKey, shift: e.shiftKey }))
    if (!e.shiftKey) anchor.current = row.key
    if (!e.ctrlKey && !e.metaKey && !e.shiftKey) openDiff(row.file, row.staged)
  }
  const fileMenu = (row: Extract<Row, { type: 'file' }>, at: Rect) => {
    if (!selected.has(row.key)) { setSelected(new Set([row.key])); anchor.current = row.key }
    setMenu({ anchor: at, items: wipFilesMenu(targets(row), row.staged, ctx(row.staged)) })
  }
  const toggleDir = (key: string) => setCollapsed((old) => { const next = new Set(old); if (next.has(key)) next.delete(key); else next.add(key); return next })

  const changed = new Set([...unstaged, ...staged].map((f) => f.path)).size
  const progress = useApp((s) => s.tabs.find((t) => t.path === path)?.toolbar.progress)
  const merging = progress?.kind
  const mergeMessage = progress?.message
  useEffect(() => { if (mergeMessage) setSummary((old) => old || mergeMessage) }, [mergeMessage])
  // Em merge/rebase parado, o commit é o "Continuar" do git; `commit` comum é recusado pelo core. O resumo vem do MERGE_MSG.
  const why = merging ? null : !staged.length && !amend ? 'Prepare arquivos para commitar' : !summary.trim() && !amend ? 'Escreva um resumo' : null
  const commit = () => {
    if (why || busy) return
    const message = description.trim() ? `${summary.trim()}\n\n${description.trim()}` : summary.trim()
    // O texto só some quando deu certo: erro (ex.: hook) não pode custar a mensagem escrita.
    const noVerify = !opts.hooks
    const done = merging ? actions.progressAction(path, 'continue', message || undefined, opts.sign, noVerify)
      : actions.execute(path, { type: 'commit', message, amend, allowEmpty: false, sign: opts.sign, noVerify })
    setBusy(true)
    void done.then(async (ok) => {
      if (!ok) return
      setSummary(''); setDescription(''); setAmend(false)
      if (opts.pushAfter) await actions.requestPush(path)
    }).finally(() => setBusy(false))
  }
  // Emendar traz a mensagem do último commit; ao desmarcar, tira de volta se ninguém mexeu nela.
  const loaded = useRef<{ summary: string; description: string } | null>(null)
  const toggleAmend = (on: boolean) => {
    setAmend(on)
    if (!on) {
      if (loaded.current && summary === loaded.current.summary && description === loaded.current.description) { setSummary(''); setDescription('') }
      loaded.current = null
      return
    }
    if (summary.trim() || description.trim()) return // não sobrescreve o que já foi escrito
    core.commitDetail(path, 'HEAD', false).then((c) => {
      loaded.current = { summary: c.subject, description: c.body.trim() }
      setSummary(loaded.current.summary); setDescription(loaded.current.description)
    }, actions.reportError)
  }
  const stash = () => {
    if (busy) return
    setBusy(true)
    void actions.execute(path, { type: 'stashCreate', message: summary.trim() || null, includeUntracked: true }).finally(() => setBusy(false))
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
        onClick={() => void actions.requestDiscard(path, [])}><Icon name="trash" size={14} strokeWidth={2} /></button>
    </div>
    <div className="wip-tools">
      <Segmented label="Exibição dos arquivos" options={FILE_VIEWS} value={view} onChange={setView} />
      <button className="wip-icon" aria-label="Ordenar arquivos"><Icon name="sortDown" size={14} strokeWidth={2} /></button>
      {selected.size > 1 && <span className="wip-picked">{plural(selected.size, 'selecionado', 'selecionados')} · botão direito para agir</span>}
    </div>
    {conflicts.length > 0 && <div className="wip-conflicts">
      <h3>Conflitos <span>{conflicts.length}</span>
        <button title="Marca todos como resolvidos com o conteúdo atual do disco" onClick={() => stage(conflicts.map((c) => c.path), true)}>Marcar todos resolvidos</button></h3>
      {conflicts.map((c) => <div key={c.path} className="conflict-file" title={c.path} onClick={() => actions.openConflict(path, c.path)}>
        <span>{c.path}</span>
        <button onClick={(e) => { e.stopPropagation(); stage([c.path], true) }}>Marcar como resolvido</button>
      </div>)}
    </div>}
    <div className="wip-files" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]!
          const style = { transform: `translateY(${item.start}px)`, height: item.size }
          if (row.type === 'head') {
            return <div key={row.key} className={row.staged ? 'wip-section staged' : 'wip-section'} style={style}>
              <span className="wip-section-chevron"><Icon name="chevronDown" size={12} strokeWidth={2} /></span>
              <span className="wip-section-name">{row.staged ? 'Preparados' : 'Não preparados'} <span>{row.count}</span></span>
              <button className={row.staged ? 'wip-ghost' : 'wip-neutral'} disabled={!row.count} onClick={() => stage([], !row.staged)}>{row.staged ? 'Tirar todos' : 'Preparar todos'}</button>
            </div>
          }
          if (row.type === 'dir') {
            const open = !collapsed.has(row.key)
            return <div key={row.key} className="wip-file wip-dir" style={{ ...style, paddingLeft: 10 + row.depth * 14 }}
              onContextMenu={(e) => { e.preventDefault(); setMenu({ anchor: point(e), items: wipFolderMenu(row.path, row.staged, ctx(row.staged)) }) }}>
              <button className="wip-dir-toggle" aria-expanded={open} onClick={() => toggleDir(row.key)}>
                <span className="wip-glyph"><Icon name={open ? 'chevronDown' : 'chevron'} size={13} /></span><span className="wip-name">{row.name}</span><span className="wip-count-dir">{row.count}</span></button>
              <span className="wip-actions">
                <button className="wip-icon" aria-label={`Ações da pasta ${row.path}`} title="Ações da pasta"
                  onClick={(e) => setMenu({ anchor: e.currentTarget.getBoundingClientRect(), items: wipFolderMenu(row.path, row.staged, ctx(row.staged)) })}><Icon name="more" size={14} /></button>
                <button className={row.staged ? 'wip-ghost small' : 'wip-stage'} onClick={() => stage([row.path], !row.staged)}>{row.staged ? 'Tirar pasta' : 'Preparar pasta'}</button>
              </span>
            </div>
          }
          const { file } = row
          const g = GLYPH[file.status] ?? GLYPH.M!
          const many = selected.has(row.key) ? chosen(row.staged) : []
          const paths = many.length > 1 ? many.map((f) => f.path) : [file.path]
          const cls = `wip-file${selected.has(row.key) ? ' selected' : ''}${opened === row.key ? ' active' : ''}`
          return <div key={row.key} className={cls} style={{ ...style, paddingLeft: 10 + row.depth * 14 }} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
            role="button" tabIndex={0} aria-pressed={selected.has(row.key)} onClick={(e) => clickFile(row, e)}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); e.currentTarget.click() } }}
            onContextMenu={(e) => { e.preventDefault(); fileMenu(row, point(e)) }}>
            <span className="wip-glyph" style={{ color: g.color }}><Icon name={g.icon} size={12} strokeWidth={2.2} /></span>
            <span className="wip-path"><span className="wip-dir">{row.dir}</span><span className="wip-name">{row.name}</span></span>
            {file.added !== null && <span className="wip-lines"><span style={{ color: '#7FDC95' }}>+{file.added}</span> <span style={{ color: '#F0877F' }}>−{file.removed}</span></span>}
            <span className="wip-actions" onClick={(e) => e.stopPropagation()}>
              <button className="wip-icon" aria-label={`Ações de ${file.path}`} title="Mais ações" onClick={(e) => fileMenu(row, e.currentTarget.getBoundingClientRect())}><Icon name="more" size={14} /></button>
              {!row.staged && <button className="wip-danger" title={paths.length > 1 ? `Descartar mudanças dos ${paths.length} selecionados` : 'Descartar mudanças deste arquivo'}
                aria-label={`Descartar ${paths.length > 1 ? `${paths.length} arquivos` : file.path}`}
                onClick={() => void actions.requestDiscard(path, paths)}><Icon name="undo" size={13} strokeWidth={2} /></button>}
              <button className={row.staged ? 'wip-ghost small' : 'wip-stage'} onClick={() => stage(paths, !row.staged)}>
                {row.staged ? 'Tirar' : 'Preparar'}{paths.length > 1 ? ` ${paths.length}` : ''}</button>
            </span>
          </div>
        })}
      </div>
    </div>
    <div className="wip-compose">
      <div role="tablist" aria-label="Ação" className="wip-tabs">
        <button role="tab" aria-selected={tab === 'commit'} onClick={() => setTab('commit')}>
          <Icon name="commit" size={14} strokeWidth={2} />Commit</button>
        <button role="tab" aria-selected={tab === 'stash'} onClick={() => setTab('stash')}>
          <Icon name="stash" size={14} strokeWidth={2} />Stash</button>
      </div>
      {tab === 'commit' && <label className="wip-amend"><input type="checkbox" checked={amend} onChange={(e) => toggleAmend(e.target.checked)} /> Emendar o último commit (amend)</label>}
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
      {tab === 'commit' && <button className="wip-options" type="button" aria-expanded={optsOpen} onClick={() => setOptsOpen((v) => !v)}>
        <Icon name={optsOpen ? 'chevronDown' : 'chevron'} size={12} strokeWidth={2} />Opções<span>· assinar: {opts.sign ? 'sim' : 'não'} · hooks: {opts.hooks ? 'sim' : 'não'} · push depois: {opts.pushAfter ? 'sim' : 'não'}</span></button>}
      {tab === 'commit' && optsOpen && <div className="wip-opts">
        <label><input type="checkbox" checked={opts.sign} onChange={(e) => setOpts({ ...opts, sign: e.target.checked })} />Assinar o commit</label>
        <label><input type="checkbox" checked={opts.hooks} onChange={(e) => setOpts({ ...opts, hooks: e.target.checked })} />Rodar hooks</label>
        <label><input type="checkbox" checked={opts.pushAfter} onChange={(e) => setOpts({ ...opts, pushAfter: e.target.checked })} />Fazer push depois do commit</label>
      </div>}
      <div className="wip-buttons">
        {tab === 'commit'
          ? <button className="wip-commit" disabled={!!why || busy} aria-busy={busy} title={why ?? undefined} onClick={commit}>
              {busy ? <><Icon name="refresh" size={14} spin />{merging ? 'Concluindo…' : 'Commitando…'}</> : why ?? (merging ? `Concluir ${merging.toLowerCase()}` : staged.length ? `Commitar ${plural(staged.length, 'arquivo', 'arquivos')} em ${branch}` : `Emendar o último commit em ${branch}`)}
              {!why && !busy && <kbd>Ctrl Enter</kbd>}</button>
          : <button className="wip-commit" disabled={!changed || busy} aria-busy={busy} title={changed ? undefined : 'Não há mudanças para guardar'} onClick={stash}>
              {busy ? <><Icon name="refresh" size={14} spin />Guardando…</> : <>Guardar {plural(changed, 'arquivo', 'arquivos')} no stash<kbd>Ctrl Enter</kbd></>}</button>}
      </div>
      {tab === 'commit' && unstaged.length > 0 && staged.length > 0 &&
        <p>{unstaged.length === 1 ? '1 arquivo não preparado fica' : `${unstaged.length} arquivos não preparados ficam`} de fora deste commit.</p>}
    </div>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Ações do WIP" onClose={() => setMenu(null)} />}
    {stashAsk && <StashConfirm paths={stashAsk} close={() => setStashAsk(null)} confirm={() => {
      setStashAsk(null); setSelected(new Set())
      void actions.execute(path, { type: 'stashCreate', message: null, includeUntracked: true, paths: stashAsk })
    }} />}
  </div>
}

/** Texto de confirmação do stash parcial dos arquivos selecionados. */
function StashConfirm({ paths, close, confirm }: { paths: string[]; close: () => void; confirm: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const one = paths.length === 1
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="stash-confirm-title" onCancel={close}>
    <h2 id="stash-confirm-title">Guardar {one ? paths[0] : `${paths.length} itens`} no stash?</h2>
    <p>Todas as mudanças, preparadas e não preparadas, {one ? 'deste item' : 'destes itens'} vão para um stash novo. O resto do WIP fica como está.</p>
    {!one && <ul className="dialog-list">{paths.slice(0, 8).map((p) => <li key={p}>{p}</li>)}{paths.length > 8 && <li className="muted">e mais {paths.length - 8}</li>}</ul>}
    <p className="muted">Com arquivo em conflito no repositório o git não guarda nada: resolva o conflito antes. Dá para recuperar com Desfazer.</p>
    <div className="actions">
      <button onClick={close}>Cancelar</button>
      <button className="primary" autoFocus onClick={confirm}>Guardar no stash</button>
    </div>
  </dialog>
}
