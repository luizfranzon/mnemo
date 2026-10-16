import { actions, useApp } from '../store/app'
import { Icon } from './Icon'

export function StatusBar() {
  const git = useApp((s) => (s.git.phase === 'ok' ? s.git.version : null))
  const update = useApp((s) => s.update)
  return (
    <footer className="statusbar">
      <span className="spacer" />
      {git && <span>git {git}</span>}
      {update.status === 'available' && <button className="statusbar-update" title={`Baixar a versão ${update.version}`} aria-label={`Baixar a versão ${update.version}`}
        onClick={() => void actions.downloadUpdate()}><Icon name="download" size={13} /> {update.version}</button>}
      {update.status === 'downloading' && <span className="statusbar-update" role="status"><Icon name="download" size={13} /> {update.percent}%</span>}
      {update.status === 'ready' && <button className="statusbar-update" title={`Reiniciar para instalar a versão ${update.version}`} aria-label="Reiniciar para atualizar"
        onClick={() => actions.installUpdate()}><Icon name="restart" size={13} /> Reiniciar para atualizar</button>}
      <button className="statusbar-version" title="Verificar atualização" onClick={() => void actions.checkUpdate()}>Mnemo {__APP_VERSION__}</button>
    </footer>
  )
}
