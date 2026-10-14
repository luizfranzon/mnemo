import { useEffect, useRef } from 'react'
import { actions, useApp } from '../store/app'

export function PrefsDialog() {
  const open = useApp((s) => s.prefsOpen)
  return open && <Prefs />
}

function Prefs() {
  const dialog = useRef<HTMLDialogElement>(null)
  const gravatar = useApp((s) => s.prefs.gravatar)
  const close = () => actions.setPrefsOpen(false)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return (
    <dialog ref={dialog} className="prefs-dialog card" aria-labelledby="prefs-title" onCancel={close}>
      <h2 id="prefs-title">Preferências</h2>
      <label>
        <input type="checkbox" autoFocus checked={gravatar} onChange={(e) => actions.setPref('gravatar', e.target.checked)} />
        Fotos do Gravatar
      </label>
      <p className="muted hint">Busca a foto de cada Autor em gravatar.com pelo hash do email, o que o revela a um terceiro. Desligado: só iniciais, nenhum request.</p>
      <div className="actions">
        <button className="primary" onClick={close}>Fechar</button>
      </div>
    </dialog>
  )
}
