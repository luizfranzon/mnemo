import { useEffect } from 'react'
import { onCoreEvent, onMenuAction } from '../bridge'
import { actions, selectActiveTab, useApp } from '../store/app'
import { GitMissing } from './GitMissing'
import { Workspace } from './Workspace'
import { useUndoShortcuts } from './useUndoShortcuts'

export function App() {
  const phase = useApp((s) => s.git.phase)

  useEffect(() => {
    void actions.checkGit().then(() => actions.openInitialPaths())
    const offCore = onCoreEvent(actions.applyCoreEvent)
    const offMenu = onMenuAction((action) => {
      const s = useApp.getState()
      const tab = selectActiveTab(s)
      if (action === 'open-repository') void actions.openRepository()
      else if (action === 'close-tab' && tab) actions.closeTab(tab.path)
      else if (action === 'undo' && tab) void actions.undo(tab.path)
      else if (action === 'redo' && tab) void actions.redo(tab.path)
      else if (action === 'palette' && tab) actions.setPalette('checkout')
    })
    return () => {
      offCore()
      offMenu()
    }
  }, [])

  useUndoShortcuts()

  if (phase === 'checking') return <div className="center muted">Verificando o git…</div>
  if (phase === 'missing') return <GitMissing />
  return <Workspace />
}
