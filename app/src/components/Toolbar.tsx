import { useEffect, useRef, useState } from 'react'
import type { PullMode } from '../bridge/types'
import { actions, runningLabel, selectActiveTab, useApp } from '../store/app'

const MODES: { value: PullMode; label: string; button: string }[] = [
  { value: 'fetch', label: 'Fetch tudo', button: 'Fetch' },
  { value: 'merge', label: 'Pull ff se possível', button: 'Pull ff' },
  { value: 'ffOnly', label: 'Pull só ff', button: 'Pull ff' },
  { value: 'rebase', label: 'Pull com rebase', button: 'Pull rebase' },
]

function relativeFetch(epoch: number | null, now: number): string {
  if (epoch === null) return 'nunca'
  const minutes = Math.max(0, Math.floor((now - epoch * 1000) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

function useNow(): number {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return now
}

/** Desfazer/Refazer agem sempre na Operação, mesmo com foco em campo de texto. */
export function Toolbar() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const name = useApp((s) => selectActiveTab(s)?.name)
  const head = useApp((s) => selectActiveTab(s)?.head)
  const undo = useApp((s) => selectActiveTab(s)?.undo)
  const toolbar = useApp((s) => selectActiveTab(s)?.toolbar)
  const running = useApp((s) => (s.activePath ? runningLabel(s, s.activePath) : undefined))
  const [pullOpen, setPullOpen] = useState(false)
  const [stashOpen, setStashOpen] = useState(false)
  const [moreOpen, setMoreOpen] = useState(false)
  const pullRef = useRef<HTMLDivElement>(null)
  const stashRef = useRef<HTMLDivElement>(null)
  const moreRef = useRef<HTMLDivElement>(null)
  const now = useNow()

  useEffect(() => {
    setPullOpen(false)
    setStashOpen(false)
    setMoreOpen(false)
  }, [path])

  useEffect(() => {
    if (running) { setPullOpen(false); setStashOpen(false); setMoreOpen(false) }
  }, [running])

  useEffect(() => {
    if (!pullOpen && !stashOpen && !moreOpen) return
    const close = (event: PointerEvent) => {
      if (!pullRef.current?.contains(event.target as Node)) setPullOpen(false)
      if (!stashRef.current?.contains(event.target as Node)) setStashOpen(false)
      if (!moreRef.current?.contains(event.target as Node)) setMoreOpen(false)
    }
    document.addEventListener('pointerdown', close)
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') { setPullOpen(false); setStashOpen(false); setMoreOpen(false) }
    }
    document.addEventListener('keydown', escape)
    return () => { document.removeEventListener('pointerdown', close); document.removeEventListener('keydown', escape) }
  }, [pullOpen, stashOpen, moreOpen])

  if (!path || !name || !head || !undo || !toolbar) return null
  const busyReason = running ? `${running} Aguarde terminar.` : undefined
  const setUpstream = head.kind === 'branch' && head.upstream === null
  const branchName = head.kind === 'branch' ? head.name : `HEAD ${head.sha}`
  const pullMode = MODES.find((m) => m.value === toolbar.pullMode) ?? MODES[1]!
  const doMode = (mode: PullMode) => {
    setPullOpen(false)
    void actions.execute(path, mode === 'fetch' ? { type: 'fetch', remote: null } : { type: 'pull', strategy: mode })
  }

  return (
    <>
      <div className="toolbar" role="toolbar" aria-label="Repositório">
        <span className="repo-name" title={path}>▱ {name}</span>
        <span className="crumb">›</span>
        <button className="branch-button" onClick={() => actions.setPalette('checkout')} disabled={!!running} title={busyReason ?? 'Checkout de branch'}>
          ⑂ {branchName} <span className="muted">⌄</span>
        </button>
        <span className="sync-count" title={head.kind === 'branch' && head.upstream ? `Em relação a ${head.upstream}` : 'Sem upstream'}>
          <span className="behind">↓{toolbar.behind ?? '–'}</span>
          <span className="ahead">↑{toolbar.ahead ?? '–'}</span>
        </span>
        <button className="fetch-time" onClick={() => void actions.execute(path, { type: 'fetch', remote: null })} disabled={!!running}
          title={busyReason ?? `Último fetch ${relativeFetch(toolbar.lastFetchEpoch, now)}. Buscar agora`}>
          {running?.toLowerCase().includes('fetch') ? <span className="spin">⟳</span> : '⟳'} {running?.toLowerCase().includes('fetch') ? running : relativeFetch(toolbar.lastFetchEpoch, now)}
        </button>
        <span className="toolbar-divider" />
        <button disabled={!undo.undo.enabled || !!running} title={busyReason ?? (undo.undo.enabled ? `Desfazer: ${undo.undo.label} (Ctrl+Z)` : undo.undo.reason ?? '')}
          onClick={() => void actions.undo(path)}>↶ Desfazer</button>
        <button disabled={!undo.redo.enabled || !!running} title={busyReason ?? (undo.redo.enabled ? `Refazer: ${undo.redo.label} (Ctrl+Y)` : undo.redo.reason ?? '')}
          onClick={() => void actions.redo(path)}>↷ Refazer</button>
        <div className="toolbar-split" ref={pullRef}>
          <button disabled={!!running} onClick={() => doMode(pullMode.value)} title={busyReason ?? pullMode.label}>
            {running?.toLowerCase().includes('pull') ? <span className="spin">⟳</span> : <span className="behind">↓</span>}
            {running?.toLowerCase().includes('pull') ? running : pullMode.button}
            {!!toolbar.behind && <span className="count-badge blue">{toolbar.behind}</span>}
          </button>
          <button aria-label="Opções de pull" aria-expanded={pullOpen} disabled={!!running} title={busyReason ?? 'Opções de pull'}
            onClick={() => setPullOpen((v) => !v)}>⌄</button>
          {pullOpen && <div className="toolbar-menu">
            <div className="toolbar-menu-heading">Executar agora</div>
            {MODES.map((m) => <button key={`run-${m.value}`} disabled={!!running} onClick={() => doMode(m.value)}>{m.label}</button>)}
            <div className="menu-sep" />
            <div className="toolbar-menu-heading">Padrão do botão</div>
            {MODES.map((m) => <button key={`default-${m.value}`} disabled={!!running} aria-pressed={toolbar.pullMode === m.value}
              onClick={() => { setPullOpen(false); void actions.setPullMode(path, m.value) }}>
              <span className="radio-mark">{toolbar.pullMode === m.value ? '●' : '○'}</span>{m.label}
            </button>)}
          </div>}
        </div>
        <button className="push-button" onClick={() => void actions.execute(path, { type: 'push', remote: null, branch: null, setUpstream })}
          disabled={!!running || head.kind !== 'branch'}
          title={busyReason ?? (setUpstream ? `Push ${branchName}: definir upstream` : `Push ${branchName} para ${head.kind === 'branch' ? head.upstream : ''}`)}>
          {running?.toLowerCase().includes('push') ? <span className="spin">⟳</span> : <span className="ahead">↑</span>}
          {running?.toLowerCase().includes('push') ? running : `Push ${branchName}`}
          {!!toolbar.ahead && <span className="count-badge green">{toolbar.ahead}</span>}
        </button>
        <button disabled={!!running} title={busyReason ?? 'Nova branch'} onClick={() => actions.setPalette('createBranch')}>
          {running?.includes('criar branch') ? <><span className="spin">⟳</span> {running}</> : '⑂ Branch'}
        </button>
        <div className="toolbar-split plain" ref={stashRef}>
          <button disabled={!!running} title={busyReason ?? 'Guardar mudanças locais'} onClick={() => void actions.execute(path, { type: 'stashCreate', message: null, includeUntracked: false })}>
            {running?.toLowerCase().includes('stash') ? <span className="spin">⟳</span> : '▣'} {running?.toLowerCase().includes('stash') ? running : 'Stash'}
            <span className="stash-count">{toolbar.stashCount}</span>
          </button>
          <button aria-label="Opções de stash" aria-expanded={stashOpen} disabled={!!running} title={busyReason ?? 'Opções de stash'} onClick={() => setStashOpen((v) => !v)}>⌄</button>
          {stashOpen && <div className="toolbar-menu">
            <button disabled={!!running} onClick={() => { setStashOpen(false); void actions.execute(path, { type: 'stashCreate', message: null, includeUntracked: true }) }}>Stash com arquivos novos</button>
            <button disabled={!!running || toolbar.stashCount === 0} onClick={() => { setStashOpen(false); void actions.execute(path, { type: 'stashPop', index: 0 }) }}>Aplicar e remover o mais recente</button>
          </div>}
        </div>
        <button className="temporary-action" disabled={!!running} title={busyReason ?? 'Descartar todas as mudanças'} onClick={() => void actions.requestDiscard(path, [])}>Descartar tudo…</button>
        <button className="temporary-action" disabled={!!running} title={busyReason ?? 'Excluir branch remota'} onClick={() => actions.setPalette('deleteRemote')}>Excluir remota…</button>
        <div className="toolbar-more" ref={moreRef}>
          <button disabled={!!running} aria-label="Mais ações do repositório" aria-expanded={moreOpen} title={busyReason ?? 'Mais ações'} onClick={() => setMoreOpen((v) => !v)}>Mais ⌄</button>
          {moreOpen && <div className="toolbar-menu">
            <button disabled={!!running} onClick={() => { setMoreOpen(false); void actions.requestDiscard(path, []) }}>Descartar tudo…</button>
            <button disabled={!!running} onClick={() => { setMoreOpen(false); actions.setPalette('deleteRemote') }}>Excluir remota…</button>
          </div>}
        </div>
        {running
          ? <span className="operation-indicator" role="status"><span className="spin">⟳</span> {running}</span>
          : <button className="toolbar-search" aria-label="Buscar branch" title="Buscar branch (Ctrl+P)" onClick={() => actions.setPalette('checkout')}>
              ⌕ <span>Buscar branch</span> <kbd>Ctrl P</kbd>
            </button>}
      </div>
      {head.kind === 'detached' && <div className="detached-banner" role="status">
        HEAD destacado · <button onClick={() => actions.setPalette('createBranch')}>Criar branch aqui</button>
      </div>}
      {toolbar.progress && <div className="progress-banner" role="status">
        <span>{toolbar.progress.kind}{toolbar.progress.step !== null && toolbar.progress.total !== null ? ` ${toolbar.progress.step}/${toolbar.progress.total}` : ''}</span>
        <button disabled={!!running} title={busyReason} onClick={() => void actions.progressAction(path, 'continue')}>Continuar</button>
        {toolbar.progress.kind === 'Rebase' && <button disabled={!!running} title={busyReason} onClick={() => void actions.progressAction(path, 'skip')}>Pular</button>}
        <button disabled={!!running} title={busyReason} onClick={() => void actions.progressAction(path, 'abort')}>Abortar</button>
      </div>}
    </>
  )
}
