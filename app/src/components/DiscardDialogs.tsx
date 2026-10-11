import { useEffect } from 'react'
import { actions, useApp } from '../store/app'

export function DiscardDialogs() {
  const prompt = useApp((s) => s.discardPrompt)
  const conflict = useApp((s) => s.restoreConflict)
  const open = prompt !== null || conflict !== null
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (prompt) actions.cancelDiscard()
      else actions.dismissRestoreConflict()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, prompt, conflict])
  if (prompt) {
    const { trackedChanges, untrackedFiles, exceedsLimit } = prompt.preview
    return (
      <div className="modal" role="dialog" aria-modal="true">
        <div className="card">
          <h2>Descartar mudanças?</h2>
          <p>
            {trackedChanges} arquivo(s) rastreado(s) e {untrackedFiles} novo(s) serão descartados.
          </p>
          {exceedsLimit ? (
            <p className="warning">Grande demais para guardar: este descarte não poderá ser desfeito.</p>
          ) : (
            <p className="muted">Dá para recuperar com Desfazer.</p>
          )}
          <div className="actions">
            <button onClick={actions.cancelDiscard}>Cancelar</button>
            <button className="primary" autoFocus onClick={() => void actions.confirmDiscard()}>
              Descartar
            </button>
          </div>
        </div>
      </div>
    )
  }
  if (conflict) {
    return (
      <div className="modal" role="dialog" aria-modal="true">
        <div className="card">
          <h2>Conflito ao desfazer</h2>
          <p>Estes arquivos foram editados depois do descarte. Nada foi alterado.</p>
          <ul>
            {conflict.paths.map((p) => (
              <li key={p}>{p}</li>
            ))}
          </ul>
          <div className="actions">
            <button onClick={actions.dismissRestoreConflict}>Fechar</button>
            <button className="primary" autoFocus onClick={() => void actions.restoreAsCopies()}>
              Restaurar como cópia ao lado
            </button>
          </div>
        </div>
      </div>
    )
  }
  return null
}
