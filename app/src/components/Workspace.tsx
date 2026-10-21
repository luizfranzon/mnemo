import { useShallow } from 'zustand/react/shallow'
import { actions, selectActiveTab, useApp } from '../store/app'
import { Breadcrumb } from './Breadcrumb'
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
  const tabs = useApp(useShallow((s) => s.tabs.map((t) => t.path)))
  const palette = useApp((s) => s.palette)
  return (
    <div className="workspace">
      <TabBar />
      {path && <Toolbar />}
      {path && <Breadcrumb path={path} />}
      <PushRejectedBar />
      {tabs.length ? (
        <div className="tab-stack">
          {tabs.map((p) => (
            <div key={p} className={p === path ? 'tab-view' : 'tab-view inactive'}>
              <Panels path={p}>
                <Graph path={p} />
              </Panels>
            </div>
          ))}
        </div>
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
