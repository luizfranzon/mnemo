import { Fragment, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import { actions, selectReview, useApp } from '../store/app'
import { tabParts } from '../store/tabLabel'
import { Icon } from './Icon'

const TAB_DRAG = 'application/x-mnemo-tab'

interface DragState { path: string; width: number }
interface DropState { path: string; side: 'before' | 'after' }

export function TabBar() {
  // Só os caminhos (strings comparam por valor): a barra não re-renderiza a cada Operação.
  const paths = useApp(useShallow((s) => s.tabs.map((t) => t.path)))
  const [drag, setDrag] = useState<DragState | null>(null)
  const [drop, setDrop] = useState<DropState | null>(null)

  const endDrag = () => { setDrag(null); setDrop(null) }

  const hoverTab = (target: string) => {
    if (!drag || target === drag.path) return setDrop(null)
    const side = paths.indexOf(drag.path) < paths.indexOf(target) ? 'after' : 'before'
    setDrop((current) => (current?.path === target && current.side === side ? current : { path: target, side }))
  }

  const dropOnBar = () => {
    if (drag && drop) actions.moveTab(drag.path, drop.path)
    endDrag()
  }

  const preview = drag ? <div className="tab-drop" style={{ width: drag.width }} aria-hidden="true" /> : null

  return (
    <div
      className="tabbar"
      role="tablist"
      onDragOver={(e) => { if (e.dataTransfer.types.includes(TAB_DRAG)) e.preventDefault() }}
      onDragLeave={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDrop(null) }}
      onDrop={dropOnBar}
    >
      {paths.map((path) => (
        <Fragment key={path}>
          {drop?.path === path && drop.side === 'before' && preview}
          <TabItem path={path} onDragStart={(width) => setDrag({ path, width })} onDragOver={() => hoverTab(path)} onDragEnd={endDrag} />
          {drop?.path === path && drop.side === 'after' && preview}
        </Fragment>
      ))}
      <button className="tab-add" aria-label="Abrir repositório" title="Abrir repositório (Ctrl+O)" onClick={() => void actions.openRepository()}>
        <Icon name="plus" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}

interface TabItemProps { path: string; onDragStart: (width: number) => void; onDragOver: () => void; onDragEnd: () => void }

function TabItem({ path, onDragStart, onDragOver, onDragEnd }: TabItemProps) {
  const { name, branch, worktree, reviewing } = useApp(useShallow((s) => {
    const parts = tabParts(s.tabs, path)
    const review = selectReview(path)(s)
    return {
      name: parts?.name ?? path,
      branch: review?.branch ?? parts?.branch ?? '',
      worktree: parts?.worktree ?? false,
      reviewing: review !== undefined,
    }
  }))
  const active = useApp((s) => s.activePath === path)
  return (
    <div
      role="tab"
      aria-selected={active}
      className={`tab${active ? ' active' : ''}${reviewing ? ' reviewing' : ''}${worktree ? ' worktree' : ''}`}
      draggable
      onDragStart={(e) => {
        e.dataTransfer.setData(TAB_DRAG, path)
        e.dataTransfer.effectAllowed = 'move'
        onDragStart(e.currentTarget.getBoundingClientRect().width)
      }}
      onDragOver={(e) => {
        if (!e.dataTransfer.types.includes(TAB_DRAG)) return
        e.preventDefault()
        onDragOver()
      }}
      onDragEnd={onDragEnd}
    >
      <button className="tab-label" onClick={() => actions.focusTab(path)} title={path}>
        <span className="tab-name">
          <span className="tab-dot" />
          <span className="tab-repo">{name}</span>
          {worktree && <span className="tab-wt">worktree</span>}
        </span>
        <span className="tab-branch">
          <Icon name={reviewing ? 'shown' : 'branch'} size={11} strokeWidth={2} />
          <span className="tab-branch-text">{reviewing ? `Revisão · ${branch}` : branch}</span>
        </span>
      </button>
      <button className="tab-close" aria-label={`Fechar ${name}`} onClick={() => actions.closeTab(path)}>
        <Icon name="close" size={14} strokeWidth={2} />
      </button>
    </div>
  )
}
