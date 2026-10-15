import { actions, selectActiveTab, useApp } from '../store/app'
import { DiscardDialogs } from './DiscardDialogs'
import { Graph } from './Graph'
import { Palette } from './Palette'
import { Panels } from './Panels'
import { StatusBar } from './StatusBar'
import { TabBar } from './TabBar'
import { Toasts } from './Toasts'
import { Toolbar } from './Toolbar'
import { PushDialog } from './PushDialog'
import { ForcePushDialog } from './ForcePushDialog'
import { PushRejectedBar } from './PushRejectedBar'

export function Workspace() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const palette = useApp((s) => s.palette)
  return (
    <div className="workspace">
      <TabBar />
      {path && <Toolbar />}
      <PushRejectedBar />
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
      <PushDialog />
      <ForcePushDialog />

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
          Abrir repositório
        </button>
      </div>
    </div>
  )
}
