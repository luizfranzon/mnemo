import { useEffect } from 'react'
import { core, onCoreEvent } from '../bridge'
import { actions, useApp } from '../store/app'
import { GitMissing } from './GitMissing'
import { Preferences } from './Preferences'
import { TitleBar } from './TitleBar'
import { Workspace } from './Workspace'
import { useUndoShortcuts } from './useUndoShortcuts'

export function App() {
  const phase = useApp((s) => s.git.phase)
  const activePath = useApp((s) => s.activePath)
  const autoFetchMinutes = useApp((s) => s.prefs.autoFetchMinutes)

  useEffect(() => {
    void actions.checkGit().then(() => actions.openInitialPaths())
    void actions.refreshUpdate()
    const refresh = () => void actions.refreshAll()
    window.addEventListener('focus', refresh)
    const off = onCoreEvent(actions.applyCoreEvent)
    return () => { window.removeEventListener('focus', refresh); off() }
  }, [])

  // observa só a aba ativa; as outras se atualizam ao ganhar o foco da janela
  useEffect(() => {
    void core.watchRepository(activePath).catch(() => undefined)
  }, [activePath])

  useEffect(() => {
    if (!autoFetchMinutes) return
    const id = window.setInterval(() => void actions.autoFetchAll(), autoFetchMinutes * 60_000)
    return () => window.clearInterval(id)
  }, [autoFetchMinutes])

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
