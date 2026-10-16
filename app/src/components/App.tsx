import { useEffect } from 'react'
import { onCoreEvent } from '../bridge'
import { actions, useApp } from '../store/app'
import { GitMissing } from './GitMissing'
import { Preferences } from './Preferences'
import { TitleBar } from './TitleBar'
import { Workspace } from './Workspace'
import { useUndoShortcuts } from './useUndoShortcuts'

export function App() {
  const phase = useApp((s) => s.git.phase)

  useEffect(() => {
    void actions.checkGit().then(() => actions.openInitialPaths())
    void actions.refreshUpdate()
    const refresh = () => void actions.refreshAll()
    window.addEventListener('focus', refresh)
    const off = onCoreEvent(actions.applyCoreEvent)
    return () => { window.removeEventListener('focus', refresh); off() }
  }, [])

  useUndoShortcuts()

  // a barra de título vem antes de tudo: sem moldura nativa, é ela que fecha e arrasta a janela
  return (
    <div className="app">
      <TitleBar />
      {phase === 'checking' ? <div className="center muted">Verificando o git…</div> : phase === 'missing' ? <GitMissing /> : <Workspace />}
      <Preferences />
    </div>
  )
}
