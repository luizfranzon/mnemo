import { useApp } from '../store/app'

export function StatusBar() {
  const git = useApp((s) => (s.git.phase === 'ok' ? s.git.version : null))
  return (
    <footer className="statusbar">
      <span className="spacer" />
      {git && <span>git {git}</span>}
      <span>Mnemo {__APP_VERSION__}</span>
    </footer>
  )
}
