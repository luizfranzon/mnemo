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
      <button className="tab-add" aria-label="Abrir repositório" title="Abrir repositório (Ctrl+O)" onClick={() => void actions.openRepository()}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M12 5v14M5 12h14" />
        </svg>
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
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M7 7l10 10M17 7L7 17" />
        </svg>
      </button>
    </div>
  )
}
