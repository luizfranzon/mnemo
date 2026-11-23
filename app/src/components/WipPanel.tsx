import { useVirtualizer } from '@tanstack/react-virtual'
import { Segmented, FILE_VIEWS } from './Segmented'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { core } from '../bridge'
import type { ConflictFile, FileChange, WipStatus } from '../bridge/types'
import { actions, commitOptions, selectDiff, selectRepoPrefs, selectWipRevision, useApp } from '../store/app'
import { fileRows } from './fileTree'
import { Icon } from './Icon'
import { IconButton } from './IconButton'
import { Menu } from './Menu'
import { copyText } from './menuBase'
import type { MenuEntry, Rect } from './menuModel'
import { plural, StashConfirm, WipCompose, type ComposeTab } from './WipCompose'
import { pickFiles, wipFilesMenu, wipFolderMenu, type WipMenuContext } from './wipMenu'
import { pointOf, WipConflicts, WipDirRow, WipFileRow, WipSectionHead, type WipFileRowData, type WipRow as Row } from './WipRows'

type FileRowData = WipFileRowData

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
  const [tab, setTab] = useState<ComposeTab>('commit')
  const [summary, setSummary] = useState('')
  const [description, setDescription] = useState('')
  const [amend, setAmend] = useState(false)
  const repoPrefs = useApp(selectRepoPrefs(path))
  const [opts, setOpts] = useState(() => commitOptions(repoPrefs))
  useEffect(() => { void actions.loadRepoPrefs(path) }, [path])
  useEffect(() => { setOpts(commitOptions(repoPrefs)) }, [repoPrefs]) // mudou nas Preferências: vira o novo padrão
  const [busy, setBusy] = useState(false) // hooks podem demorar: trava o botão e mostra o carregando
  const scroller = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let active = true
    void core.wipStatus(path).then((next) => active && setStatus(next), (err) => active && actions.reportError(err, path))
    void core.conflictList(path).then((next) => active && setConflicts(next), (err) => active && actions.reportError(err, path))
    return () => { active = false }
  }, [path, revision])

  const stage = (paths: string[], on: boolean) => void core.stage(path, paths, on).then(() => actions.wipChanged(path), (err) => actions.reportError(err, path))
  const { unstaged, staged } = status
  const rows: Row[] = [
    { type: 'head', key: 'h:u', staged: false, count: unstaged.length },
    ...fileRows(unstaged, view, collapsed, 'u:').map((r): Row => ({ ...r, staged: false })),
    { type: 'head', key: 'h:s', staged: true, count: staged.length },
    ...fileRows(staged, view, collapsed, 's:').map((r): Row => ({ ...r, staged: true })),
  ]
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 10,
    estimateSize: (i) => (rows[i]!.type === 'head' ? 40 : 36), getItemKey: (i) => rows[i]!.key })

  // a seleção só vale para arquivos que ainda existem na seção
  const sectionFiles = (isStaged: boolean) => (isStaged ? staged : unstaged)
  const chosen = (isStaged: boolean) => sectionFiles(isStaged).filter((f) => selected.has(`${isStaged ? 's' : 'u'}:${f.path}`))
  const targets = (row: Extract<Row, { type: 'file' }>) => (selected.has(row.key) ? chosen(row.staged) : [row.file])
  const openDiff = (file: FileChange, isStaged: boolean) => actions.openDiff({ path, file, source: { kind: isStaged ? 'staged' : 'unstaged' } })
  const ctx = (isStaged: boolean): WipMenuContext => ({
    stage, discard: (paths) => void actions.requestDiscard(path, paths), stash: setStashAsk, copy: copyText,
    ignore: (pattern) => void core.ignore(path, pattern).then(() => actions.wipChanged(path), (err) => actions.reportError(err, path)),
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
    }, (err) => actions.reportError(err, path))
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
      <IconButton className="wip-danger" icon="trash" size={14} strokeWidth={2} disabled={!changed} title="Descartar todas as mudanças (pede confirmação)" label="Descartar todas as mudanças"
        onClick={() => void actions.requestDiscard(path, [])} />
    </div>
    <div className="wip-tools">
      <Segmented label="Exibição dos arquivos" options={FILE_VIEWS} value={view} onChange={setView} />
      <IconButton className="wip-icon" icon="sortDown" size={14} strokeWidth={2} label="Ordenar arquivos" />
      {selected.size > 1 && <span className="wip-picked">{plural(selected.size, 'selecionado', 'selecionados')} · botão direito para agir</span>}
    </div>
    {conflicts.length > 0 && <WipConflicts conflicts={conflicts} onOpen={(file) => actions.openConflict(path, file)} onResolve={(paths) => stage(paths, true)} />}
    <div className="wip-files" ref={scroller}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]!
          const style = { transform: `translateY(${item.start}px)`, height: item.size }
          if (row.type === 'head') return <WipSectionHead key={row.key} staged={row.staged} count={row.count} style={style} onStageAll={() => stage([], !row.staged)} />
          if (row.type === 'dir') {
            const folderMenu = (at: Rect) => setMenu({ anchor: at, items: wipFolderMenu(row.path, row.staged, ctx(row.staged)) })
            return <WipDirRow key={row.key} row={row} open={!collapsed.has(row.key)} style={style} onToggle={() => toggleDir(row.key)}
              onContextMenu={(e) => { e.preventDefault(); folderMenu(pointOf(e)) }} onMenu={folderMenu} onStage={() => stage([row.path], !row.staged)} />
          }
          const many = selected.has(row.key) ? chosen(row.staged) : []
          const paths = many.length > 1 ? many.map((f) => f.path) : [row.file.path]
          return <WipFileRow key={row.key} row={row} paths={paths} selected={selected.has(row.key)} active={opened === row.key} style={style}
            onClick={(e) => clickFile(row, e)} onContextMenu={(e) => { e.preventDefault(); fileMenu(row, pointOf(e)) }} onMenu={(at) => fileMenu(row, at)}
            onDiscard={() => void actions.requestDiscard(path, paths)} onStage={() => stage(paths, !row.staged)} />
        })}
      </div>
    </div>
    <WipCompose tab={tab} onTab={setTab} summary={summary} onSummary={setSummary} description={description} onDescription={setDescription}
      amend={amend} onAmend={toggleAmend} opts={opts} onOpts={setOpts} busy={busy} merging={merging} why={why} branch={branch}
      stagedCount={staged.length} unstagedCount={unstaged.length} changed={changed} onCommit={commit} onStash={stash} />
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Ações do WIP" onClose={() => setMenu(null)} />}
    {stashAsk && <StashConfirm paths={stashAsk} close={() => setStashAsk(null)} confirm={() => {
      setStashAsk(null); setSelected(new Set())
      void actions.execute(path, { type: 'stashCreate', message: null, includeUntracked: true, paths: stashAsk })
    }} />}
  </div>
}
