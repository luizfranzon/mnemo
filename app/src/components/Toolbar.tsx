import { useEffect, useState } from 'react'
import type { OperationKind, PullMode } from '../bridge/types'
import { actions, runningLabel, selectActiveTab, useApp } from '../store/app'
import { Menu } from './Menu'
import type { MenuEntry, Rect } from './menuModel'
import { PULL_MODES, toolbarAvailability } from './toolbarModel'

function relativeFetch(epoch: number | null, now: number): string {
  if (epoch === null) return 'nunca'
  const minutes = Math.max(0, Math.floor((now - epoch * 1000) / 60_000))
  if (minutes < 1) return 'agora'
  if (minutes < 60) return `há ${minutes} min`
  const hours = Math.floor(minutes / 60)
  if (hours < 24) return `há ${hours} h`
  return `há ${Math.floor(hours / 24)} d`
}

// O relógio só atualiza este controle, não a toolbar inteira.
function FetchButton({ epoch, reason, label, run }: { epoch: number | null; reason?: string; label?: string; run: () => void }) {
  const [now, setNow] = useState(Date.now())
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 60_000)
    return () => window.clearInterval(id)
  }, [])
  return <button className="fetch-time" disabled={!!reason} onClick={run}
    title={reason ?? `Último fetch ${relativeFetch(epoch, now)}. Buscar todos os remotos agora`}>
    {label ? <Spinner label={label} /> : <>⟳ {relativeFetch(epoch, now)}</>}
  </button>
}

function Spinner({ label }: { label: string }) {
  return <><span className="spin" aria-hidden="true">⟳</span> {label}</>
}

type Control = 'fetch' | 'pull' | 'push' | 'stash' | 'checkout' | 'branch' | 'discard' | 'undo' | 'redo' | 'continue' | 'skip' | 'abort'
type OpenMenu = { name: 'pull' | 'stash' | 'more'; anchor: Rect }

/** Desfazer/Refazer agem na Operação, mesmo com foco em campo de texto. */
export function Toolbar() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const name = useApp((s) => selectActiveTab(s)?.name)
  const head = useApp((s) => selectActiveTab(s)?.head)
  const undo = useApp((s) => selectActiveTab(s)?.undo)
  const toolbar = useApp((s) => selectActiveTab(s)?.toolbar)
  const running = useApp((s) => (s.activePath ? runningLabel(s, s.activePath) : undefined))
  const [open, setOpen] = useState<OpenMenu | null>(null)
  const [pending, setPending] = useState<{ path: string; control: Control; label: string } | null>(null)
  useEffect(() => { setOpen(null) }, [path, running])
  if (!path || !name || !head || !undo || !toolbar) return null

  const local = pending?.path === path ? pending : null
  const executing = running ?? local?.label
  const reason = toolbarAvailability(head, toolbar, executing)
  const branchName = head.kind === 'branch' ? head.name : `HEAD ${head.sha}`
  const mode = PULL_MODES.find((m) => m.value === toolbar.pullMode) ?? PULL_MODES[1]!
  const run = async (control: Control, label: string, action: () => Promise<void>) => {
    setOpen(null)
    const task = { path, control, label }
    setPending(task)
    try { await action() } finally { setPending((current) => current === task ? null : current) }
  }
  const execute = (control: Control, label: string, kind: OperationKind) => void run(control, label, () => actions.execute(path, kind))
  const fetching = () => execute('fetch', 'Fazendo fetch…', { type: 'fetch', remote: null })
  const doMode = (value: PullMode) => execute('pull', value === 'fetch' ? 'Fazendo fetch…' : 'Fazendo pull…',
    value === 'fetch' ? { type: 'fetch', remote: null } : { type: 'pull', strategy: value })
  const eventControl: Control | undefined = running === 'Fazendo fetch…' ? 'fetch'
    : running === 'Fazendo pull…' ? 'pull' : running === 'Fazendo push…' ? 'push'
    : running?.startsWith('Executando checkout ') ? 'checkout'
    : running?.startsWith('Executando criar branch ') ? 'branch'
    : running?.startsWith('Executando descartar ') ? 'discard'
    : running?.startsWith('Executando criar stash') || running?.startsWith('Executando pop de stash') ? 'stash' : undefined
  const spinLabel = (control: Control) => (local?.control ?? eventControl) === control ? executing : undefined
  const toggle = (menu: OpenMenu['name'], button: HTMLElement) => {
    setOpen(open?.name === menu ? null : { name: menu, anchor: button.getBoundingClientRect() })
  }
  const menuItems: Record<OpenMenu['name'], MenuEntry[]> = {
    pull: [
      { label: 'Executar agora', heading: true },
      ...PULL_MODES.map((m) => ({ label: m.label, reason: m.value === 'fetch' ? reason.fetch : reason.pull, run: () => doMode(m.value) })),
      '-', { label: 'Ação do botão Pull', heading: true },
      ...PULL_MODES.map((m) => ({ label: m.label, checked: toolbar.pullMode === m.value, reason: reason.busy,
        run: () => void actions.setPullMode(path, m.value) })),
    ],
    stash: [
      { label: 'Stash incluindo arquivos novos', reason: reason.mutation,
        run: () => execute('stash', 'Executando criar stash…', { type: 'stashCreate', message: null, includeUntracked: true }) },
      { label: 'Aplicar e remover o mais recente', reason: reason.mutation ?? (toolbar.stashCount ? undefined : 'Nenhum stash disponível'),
        run: () => execute('stash', 'Executando pop de stash…', { type: 'stashPop', index: 0 }) },
    ],
    more: [
      { label: 'Descartar tudo', reason: reason.mutation, run: () => void actions.requestDiscard(path, []) },
    ],
  }
  const menuButton = (which: OpenMenu['name'], label: string, blocked?: string) => <button
    aria-label={label} aria-haspopup="menu" aria-expanded={open?.name === which} disabled={!!blocked} title={blocked ?? label}
    onClick={(e) => toggle(which, e.currentTarget)}>⌄</button>

  return <>
    <div className="toolbar" role="toolbar" aria-label="Repositório">
      <span className="repo-name" title={path}>▱ {name}</span><span className="crumb">›</span>
      <button className="branch-button" disabled={!!reason.mutation} title={reason.mutation ?? 'Checkout de branch'} onClick={() => actions.setPalette('checkout')}>
        {spinLabel('checkout') ? <Spinner label={spinLabel('checkout')!} /> : <>⑂ {branchName} <span className="muted">⌄</span></>}
      </button>
      <span className="sync-count" title={head.kind === 'branch' && head.upstream ? `Em relação a ${head.upstream}` : 'Sem upstream'}>
        <span className="behind">↓{toolbar.behind ?? '–'}</span><span className="ahead">↑{toolbar.ahead ?? '–'}</span>
      </span>
      <FetchButton epoch={toolbar.lastFetchEpoch} reason={reason.fetch} label={spinLabel('fetch')} run={fetching} />
      <span className="toolbar-divider" />
      <button disabled={!undo.undo.enabled || !!executing} title={reason.busy ?? (undo.undo.enabled ? `Desfazer: ${undo.undo.label} (Ctrl+Z)` : undo.undo.reason ?? '')}
        onClick={() => void run('undo', 'Desfazendo…', () => actions.undo(path))}>{spinLabel('undo') ? <Spinner label={spinLabel('undo')!} /> : '↶ Desfazer'}</button>
      <button disabled={!undo.redo.enabled || !!executing} title={reason.busy ?? (undo.redo.enabled ? `Refazer: ${undo.redo.label} (Ctrl+Y)` : undo.redo.reason ?? '')}
        onClick={() => void run('redo', 'Refazendo…', () => actions.redo(path))}>{spinLabel('redo') ? <Spinner label={spinLabel('redo')!} /> : '↷ Refazer'}</button>
      <div className="toolbar-split">
        <button disabled={!!(mode.value === 'fetch' ? reason.fetch : reason.pull)} title={(mode.value === 'fetch' ? reason.fetch : reason.pull) ?? mode.label} onClick={() => doMode(mode.value)}>
          {spinLabel('pull') ? <Spinner label={spinLabel('pull')!} /> : <><span className="behind">↓</span> {mode.button}</>}
          {!!toolbar.behind && <span className="count-badge blue">{toolbar.behind}</span>}
        </button>
        {menuButton('pull', 'Opções de pull', reason.busy)}
      </div>
      <button className="push-button" disabled={!!reason.push} title={reason.push ?? (head.kind === 'branch' && head.upstream ? `Push ${branchName} para ${head.upstream}` : `Push ${branchName}: definir upstream`)}
        onClick={() => void run('push', 'Fazendo push…', () => actions.requestPush(path))}>
        {spinLabel('push') ? <Spinner label={spinLabel('push')!} /> : <><span className="ahead">↑</span> Push <span className="push-branch">{branchName}</span></>}
        {!!toolbar.ahead && <span className="count-badge green">{toolbar.ahead}</span>}
      </button>
      <button disabled={!!reason.mutation} title={reason.mutation ?? 'Nova branch'} onClick={() => actions.setPalette('createBranch')}>
        {spinLabel('branch') ? <Spinner label={spinLabel('branch')!} /> : '⑂ Branch'}</button>
      <div className="toolbar-split plain">
        <button disabled={!!reason.mutation} title={reason.mutation ?? 'Guardar mudanças locais'}
          onClick={() => execute('stash', 'Executando criar stash…', { type: 'stashCreate', message: null, includeUntracked: false })}>
          {spinLabel('stash') ? <Spinner label={spinLabel('stash')!} /> : '▣ Stash'}{!!toolbar.stashCount && <span className="stash-count">{toolbar.stashCount}</span>}
        </button>
        {menuButton('stash', 'Opções de stash', reason.mutation)}
      </div>
      <button className="temporary-action" disabled={!!reason.mutation} title={reason.mutation ?? 'Descartar todas as mudanças'} onClick={() => void actions.requestDiscard(path, [])}>
        {spinLabel('discard') ? <Spinner label={spinLabel('discard')!} /> : 'Descartar tudo'}</button>
      <div className="toolbar-more">{menuButton('more', 'Mais ações do repositório', reason.mutation)}</div>
      {executing && <span className="operation-indicator" role="status">{executing}</span>}
      <button className="toolbar-search" aria-label="Buscar branch" disabled={!!reason.busy} title={reason.busy ?? 'Buscar branch (Ctrl+P)'} onClick={() => actions.setPalette('checkout')}>
        ⌕ <span>Buscar branch</span> <kbd>Ctrl P</kbd>
      </button>
    </div>
    {head.kind === 'detached' && <div className="progress-banner" role="status">
      <span>HEAD destacado · {head.sha}</span><button disabled={!!reason.mutation} title={reason.mutation} onClick={() => actions.setPalette('createBranch')}>Criar branch aqui</button>
    </div>}
    {toolbar.progress && <div className="progress-banner" role="status">
      <span>{toolbar.progress.kind}{toolbar.progress.step !== null && toolbar.progress.total !== null ? ` ${toolbar.progress.step}/${toolbar.progress.total}` : ''}</span>
      <button disabled={!!executing} title={reason.busy} onClick={() => void run('continue', 'Continuando…', () => actions.progressAction(path, 'continue'))}>
        {spinLabel('continue') ? <Spinner label={spinLabel('continue')!} /> : 'Continuar'}</button>
      {toolbar.progress.kind === 'Rebase' && <button disabled={!!executing} title={reason.busy} onClick={() => void run('skip', 'Pulando…', () => actions.progressAction(path, 'skip'))}>
        {spinLabel('skip') ? <Spinner label={spinLabel('skip')!} /> : 'Pular'}</button>}
      <button disabled={!!executing} title={reason.busy} onClick={() => void run('abort', 'Abortando…', () => actions.progressAction(path, 'abort'))}>
        {spinLabel('abort') ? <Spinner label={spinLabel('abort')!} /> : 'Abortar'}</button>
    </div>}
    {open && <Menu items={menuItems[open.name]} anchor={open.anchor} label={open.name === 'pull' ? 'Opções de pull' : open.name === 'stash' ? 'Opções de stash' : 'Mais ações'} onClose={() => setOpen(null)} />}
  </>
}
