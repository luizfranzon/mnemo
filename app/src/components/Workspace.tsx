import { actions, selectActiveTab, useApp } from '../store/app'
import { DiscardDialogs } from './DiscardDialogs'
import { Palette } from './Palette'
import { TabBar } from './TabBar'
import { Toasts } from './Toasts'
import { Toolbar } from './Toolbar'

export function Workspace() {
  const hasTab = useApp((s) => selectActiveTab(s) !== undefined)
  const paletteOpen = useApp((s) => s.paletteOpen)
  return (
    <div className="workspace">
      <TabBar />
      {hasTab && <Toolbar />}
      <ErrorBanner />
      <main className="main">{hasTab ? <RepoSummary /> : <Empty />}</main>
      <DiscardDialogs />

      <Toasts />
      {paletteOpen && <Palette />}
    </div>
  )
}

function Empty() {
  return (
    <div className="center">
      <div className="card">
        <h1>Mnemo</h1>
        <p className="muted">Abra uma pasta com um repositório git.</p>
        <button className="primary" onClick={() => void actions.openRepository()}>
          Abrir repositório…
        </button>
      </div>
    </div>
  )
}

function RepoSummary() {
  const head = useApp((s) => selectActiveTab(s)?.head)
  if (!head) return null
  return (
    <div className="center">
      {head.kind === 'branch' ? (
        <p>
          Branch atual: <strong data-testid="current-branch">{head.name}</strong>
        </p>
      ) : (
        <p className="warning">
          HEAD destacado em <strong data-testid="current-branch">{head.sha}</strong>
        </p>
      )}
    </div>
  )
}

function ErrorBanner() {
  const error = useApp((s) => s.error)
  const retry = useApp((s) => s.retry)
  if (!error) return null
  return (
    <div className="error" role="alert">
      <span>{error}</span>
      {retry && <button onClick={() => void retry()}>Tentar de novo</button>}
      <button onClick={actions.clearError}>Fechar</button>
    </div>
  )
}
