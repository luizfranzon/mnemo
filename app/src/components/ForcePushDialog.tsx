import { useState } from 'react'
import { actions, useApp } from '../store/app'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'

/** Confirma o Force Push mostrando o que se perde; cancelar nunca dispara uma Operação. */
export function ForcePushDialog() {
  const prompt = useApp((s) => s.forcePrompt)
  return prompt && <Confirm key={`${prompt.path}:${prompt.preview.sha}`} preview={prompt.preview} />
}

function Confirm({ preview }: { preview: NonNullable<ReturnType<typeof useApp.getState>['forcePrompt']>['preview'] }) {
  const [busy, setBusy] = useState(false)
  const target = `${preview.remote}/${preview.remoteBranch}`
  return (
    <Dialog titleId="force-push-title" onCancel={(e) => busy ? e.preventDefault() : actions.cancelForcePush()}>
      <h2 id="force-push-title">Force Push de {preview.branch}</h2>
      <p>{preview.lost > 0
        ? `Isto sobrescreve ${preview.lost === 1 ? '1 commit' : `${preview.lost} commits`} de ${target} que não estão na sua branch.`
        : `${target} não tem commits que a sua branch não tenha; só a história será reescrita.`} Não dá para desfazer.</p>
      <DialogActions>
        <Button autoFocus disabled={busy} onClick={actions.cancelForcePush}>Cancelar</Button>
        <Button primary danger loading={busy} onClick={() => { setBusy(true); void actions.confirmForcePush().finally(() => setBusy(false)) }}>Force Push</Button>
      </DialogActions>
    </Dialog>
  )
}
