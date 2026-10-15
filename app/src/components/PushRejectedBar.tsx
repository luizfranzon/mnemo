import { useEffect } from 'react'
import { actions, selectActiveTab, useApp } from '../store/app'

/** Barra sobre o grafo depois de um push rejeitado. Some ao trocar de aba ou de branch. */
export function PushRejectedBar() {
  const rejected = useApp((s) => s.pushRejected)
  const here = useApp((s) => {
    const tab = selectActiveTab(s)
    return tab && s.pushRejected && tab.path === s.pushRejected.path && tab.head.kind === 'branch' && tab.head.name === s.pushRejected.branch
  })
  const running = useApp((s) => !!(rejected && s.running[rejected.path]))
  useEffect(() => { if (rejected && !here) actions.cancelPushRejected() }, [rejected, here])
  if (!rejected || !here) return null
  return (
    <div className="push-bar" role="alert">
      <span>'{rejected.branch}' está atrás de '{rejected.upstream}'. Atualize a branch com um Pull.</span>
      <button disabled={running} onClick={() => void actions.pullAfterRejection(rejected.path)}>Pull (avança se possível)</button>
      <button className="danger" disabled={running} onClick={() => void actions.requestForcePush(rejected.path)}>Force Push</button>
      <button disabled={running} onClick={actions.cancelPushRejected}>Cancelar</button>
    </div>
  )
}
