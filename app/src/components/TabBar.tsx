import { useShallow } from 'zustand/react/shallow'
import { actions, selectReview, useApp } from '../store/app'
import { tabLabel } from '../store/tabLabel'
import { Icon } from './Icon'

export function TabBar() {
  // Só os caminhos (strings comparam por valor): a barra não re-renderiza a cada Operação.
  const paths = useApp(useShallow((s) => s.tabs.map((t) => t.path)))
  return (
    <div className="tabbar" role="tablist">
      {paths.map((path) => (
        <TabItem key={path} path={path} />
      ))}
      <button className="tab-add" aria-label="Abrir repositório" title="Abrir repositório (Ctrl+O)" onClick={() => void actions.openRepository()}>
        <Icon name="plus" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

function TabItem({ path }: { path: string }) {
  const name = useApp((s) => {
    const label = tabLabel(s.tabs, path) ?? path
    const review = selectReview(path)(s)
    return review ? `Revisão: ${label} - ${review.branch}` : label
  })
  const active = useApp((s) => s.activePath === path)
  const reviewing = useApp((s) => selectReview(path)(s) !== undefined)
  return (
    <div role="tab" aria-selected={active} className={`tab${active ? ' active' : ''}${reviewing ? ' reviewing' : ''}`}>
      <button className="tab-label" onClick={() => actions.focusTab(path)} title={reviewing ? `${name}\n${path}` : path}>
        {name}
      </button>
      <button className="tab-close" aria-label={`Fechar ${name}`} onClick={() => actions.closeTab(path)}>
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
