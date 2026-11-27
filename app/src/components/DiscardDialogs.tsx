import { actions, useApp } from '../store/app'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'

export function DiscardDialogs() {
  const prompt = useApp((s) => s.discardPrompt)
  const reset = useApp((s) => s.resetPrompt)
  const conflict = useApp((s) => s.restoreConflict)
  const checkout = useApp((s) => s.checkoutPrompt)
  if (checkout) return <Dialog titleId="checkout-dialog-title" onCancel={actions.cancelCheckout}>
    <h2 id="checkout-dialog-title">Você tem {checkout.conflicts} arquivo(s) alterado(s)</h2>
    <p>Essas mudanças também existem em {checkout.target}. Como quer trocar de branch?</p>
    <DialogActions>
      <Button autoFocus onClick={actions.cancelCheckout}>Cancelar</Button>
      <Button onClick={() => void actions.confirmCheckout('stash')}>Stash e trocar</Button>
      <Button primary onClick={() => void actions.confirmCheckout('carry')}>Levar mudanças</Button>
    </DialogActions>
  </Dialog>
  if (reset) {
    const { commits, trackedChanges, untrackedFiles, exceedsLimit } = reset.preview
    return (
      <Dialog titleId="reset-dialog-title" onCancel={actions.cancelReset}>
        <h2 id="reset-dialog-title">Reset hard?</h2>
        <p>
          {commits} commit(s) saem da branch e {trackedChanges} arquivo(s) rastreado(s) e {untrackedFiles} novo(s) serão descartados.
        </p>
        {exceedsLimit ? (
          <p className="warning">Grande demais para guardar: este reset não poderá ser desfeito.</p>
        ) : (
          <p className="muted">Dá para recuperar com Desfazer.</p>
        )}
        <DialogActions>
          <Button onClick={actions.cancelReset}>Cancelar</Button>
          <Button primary danger autoFocus onClick={() => void actions.confirmReset()}>Reset hard</Button>
        </DialogActions>
      </Dialog>
    )
  }
  if (prompt) {
    const { trackedChanges, untrackedFiles, exceedsLimit } = prompt.preview
    return (
      <Dialog titleId="discard-dialog-title" onCancel={actions.cancelDiscard}>
        <h2 id="discard-dialog-title">Descartar mudanças?</h2>
        <p>
          {trackedChanges} arquivo(s) rastreado(s) e {untrackedFiles} novo(s) serão descartados.
        </p>
        {exceedsLimit ? (
          <p className="warning">Grande demais para guardar: este descarte não poderá ser desfeito.</p>
        ) : (
          <p className="muted">Dá para recuperar com Desfazer.</p>
        )}
        <DialogActions>
          <Button onClick={actions.cancelDiscard}>Cancelar</Button>
          <Button primary danger autoFocus onClick={() => void actions.confirmDiscard()}>Descartar</Button>
        </DialogActions>
      </Dialog>
    )
  }
  if (conflict) {
    return (
      <Dialog titleId="restore-conflict-title" onCancel={actions.dismissRestoreConflict}>
        <h2 id="restore-conflict-title">Conflito ao desfazer</h2>
        <p>Estes arquivos foram editados depois do descarte. Nada foi alterado.</p>
        <ul>
          {conflict.paths.map((p) => (
            <li key={p}>{p}</li>
          ))}
        </ul>
        <DialogActions>
          <Button onClick={actions.dismissRestoreConflict}>Fechar</Button>
          <Button primary autoFocus onClick={() => void actions.restoreAsCopies()}>Restaurar como cópia ao lado</Button>
        </DialogActions>
      </Dialog>
    )
  }
  return null
}
