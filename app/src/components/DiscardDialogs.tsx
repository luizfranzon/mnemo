import { useEffect } from 'react'
import { actions, useApp } from '../store/app'

export function DiscardDialogs() {
  const prompt = useApp((s) => s.discardPrompt)
  const reset = useApp((s) => s.resetPrompt)
  const conflict = useApp((s) => s.restoreConflict)
  const checkout = useApp((s) => s.checkoutPrompt)
  const open = prompt !== null || reset !== null || conflict !== null || checkout !== null
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      if (checkout) actions.cancelCheckout()
      else if (prompt) actions.cancelDiscard()
      else if (reset) actions.cancelReset()
      else actions.dismissRestoreConflict()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, prompt, reset, conflict, checkout])
  if (checkout) return <div className="modal" role="dialog" aria-modal="true" aria-label="Mudanças locais no checkout">
    <div className="card">
      <h2>Você tem {checkout.conflicts} arquivo(s) alterado(s)</h2>
      <p>Essas mudanças também existem em {checkout.target}. Como quer trocar de branch?</p>
      <div className="actions">
        <button autoFocus onClick={actions.cancelCheckout}>Cancelar</button>
        <button onClick={() => void actions.confirmCheckout('stash')}>Stash e trocar</button>
        <button className="primary" onClick={() => void actions.confirmCheckout('carry')}>Levar mudanças</button>
      </div>
    </div>
  </div>
  if (reset) {
    const { commits, trackedChanges, untrackedFiles, exceedsLimit } = reset.preview
    return (
      <div className="modal" role="dialog" aria-modal="true">
        <div className="card">
          <h2>Reset hard?</h2>
          <p>
            {commits} commit(s) saem da branch e {trackedChanges} arquivo(s) rastreado(s) e {untrackedFiles} novo(s) serão descartados.
          </p>
          {exceedsLimit ? (
            <p className="warning">Grande demais para guardar: este reset não poderá ser desfeito.</p>
          ) : (
            <p className="muted">Dá para recuperar com Desfazer.</p>
          )}
          <div className="actions">
            <button onClick={actions.cancelReset}>Cancelar</button>
            <button className="primary" autoFocus onClick={() => void actions.confirmReset()}>
              Reset hard
            </button>
          </div>
        </div>
      </div>
    )
  }
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
