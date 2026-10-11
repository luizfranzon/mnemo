import { actions, selectActiveTab, useApp } from '../store/app'
import { DiscardDialogs } from './DiscardDialogs'
import { Graph } from './Graph'
import { Palette } from './Palette'
import { Panels } from './Panels'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { Toasts } from './Toasts'
import { Toolbar } from './Toolbar'

export function Workspace() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const palette = useApp((s) => s.palette)
  return (
    <div className="workspace">
      <TabBar />
      {path && <Toolbar />}
      <ErrorBanner />
      {path ? (
        <Panels key={path} path={path}>
          <Graph key={path} path={path} />
        </Panels>
      ) : (
        <main className="main">
          <Empty />
        </main>
      )}
      <StatusBar />
      <DiscardDialogs />

      <Toasts />
      {palette && <Palette key={palette} mode={palette} />}
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

function ErrorBanner() {
  const error = useApp((s) => s.error)
  const retry = useApp((s) => s.retry)
  if (!error) return null
  return (
    <div className="error" role="alert">
      <span>{error}</span>
      {retry && <button
          onClick={() => {
            actions.clearError() // some o banner (e o botão) antes: clique duplo não repete a Operação
            void retry()
          }}
        >Tentar de novo</button>}
      <button onClick={actions.clearError}>Fechar</button>
    </div>
  )
}
