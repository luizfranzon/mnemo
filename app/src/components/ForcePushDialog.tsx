import { useEffect, useRef } from 'react'
import { actions, useApp } from '../store/app'

/** Confirma o Force Push mostrando o que se perde; cancelar nunca dispara uma Operação. */
export function ForcePushDialog() {
  const prompt = useApp((s) => s.forcePrompt)
  return prompt && <Confirm key={`${prompt.path}:${prompt.preview.sha}`} preview={prompt.preview} />
}

function Confirm({ preview }: { preview: NonNullable<ReturnType<typeof useApp.getState>['forcePrompt']>['preview'] }) {
  const dialog = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = dialog.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const target = `${preview.remote}/${preview.remoteBranch}`
  return (
    <dialog ref={dialog} className="push-dialog card" aria-labelledby="force-push-title" onCancel={actions.cancelForcePush}>
      <h2 id="force-push-title">Force Push de {preview.branch}</h2>
      <p>{preview.lost > 0
        ? `Isto sobrescreve ${preview.lost === 1 ? '1 commit' : `${preview.lost} commits`} de ${target} que não estão na sua branch.`
        : `${target} não tem commits que a sua branch não tenha; só a história será reescrita.`} Não dá para desfazer.</p>
      <div className="actions">
        <button autoFocus onClick={actions.cancelForcePush}>Cancelar</button>
        <button className="primary danger" onClick={() => void actions.confirmForcePush()}>Force Push</button>
      </div>
    </dialog>
  )
}
