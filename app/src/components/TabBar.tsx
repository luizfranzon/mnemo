import { useShallow } from 'zustand/react/shallow'
import { actions, useApp } from '../store/app'

export function TabBar() {
  // Só os caminhos (strings comparam por valor): a barra não re-renderiza a cada Operação.
  const paths = useApp(useShallow((s) => s.tabs.map((t) => t.path)))
  return (
    <div className="tabbar" role="tablist">
      {paths.map((path) => (
        <TabItem key={path} path={path} />
      ))}
      <button className="tab-add" aria-label="Abrir repositório" onClick={() => void actions.openRepository()}>
        +
      </button>
    </div>
  )
}

function TabItem({ path }: { path: string }) {
  const name = useApp((s) => s.tabs.find((t) => t.path === path)?.name ?? path)
  const active = useApp((s) => s.activePath === path)
  return (
    <div role="tab" aria-selected={active} className={active ? 'tab active' : 'tab'}>
      <button className="tab-label" onClick={() => actions.focusTab(path)} title={path}>
        {name}
      </button>
      <button className="tab-close" aria-label={`Fechar ${name}`} onClick={() => actions.closeTab(path)}>
        ×
      </button>
    </div>
  )
}
