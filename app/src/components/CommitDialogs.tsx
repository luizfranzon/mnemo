import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import { actions } from '../store/app'
import type { CommitDialog } from './commitMenu'

/** Tag, editar mensagem, restaurar e excluir arquivo. Cancelar (botão, Esc) nunca dispara uma Operação. */
export function CommitDialogs({ path, dialog, close }: { path: string; dialog: CommitDialog; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  const run = (kind: Parameters<typeof actions.execute>[1]) => { close(); void actions.execute(path, kind) }
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="commit-dialog-title" onCancel={close}>
    {dialog.type === 'tag' ? <Tag dialog={dialog} close={close} run={run} />
      : dialog.type === 'reword' ? <Reword path={path} sha={dialog.sha} close={close} run={run} />
        : <FileConfirm dialog={dialog} close={close} run={run} />}
  </dialog>
}

type Props = { close: () => void; run: (kind: Parameters<typeof actions.execute>[1]) => void }

function Tag({ dialog, close, run }: Props & { dialog: Extract<CommitDialog, { type: 'tag' }> }) {
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const valid = name.trim() !== '' && (!dialog.annotated || message.trim() !== '')
  const confirm = () => valid && run({ type: 'tagCreate', name: name.trim(), target: dialog.sha, message: dialog.annotated ? message.trim() : null })
  return <>
    <h2 id="commit-dialog-title">{dialog.annotated ? 'Criar tag anotada' : 'Criar tag'} em {dialog.sha.slice(0, 7)}</h2>
    <label htmlFor="tag-name">Nome da tag</label>
    <input id="tag-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirm() }} />
    {dialog.annotated && <>
      <label htmlFor="tag-message">Mensagem</label>
      <textarea id="tag-message" rows={3} value={message} onChange={(e) => setMessage(e.target.value)} />
    </>}
    <div className="actions">
      <button onClick={close}>Cancelar</button>
      <button className="primary" disabled={!valid} onClick={confirm}>Criar tag</button>
    </div>
  </>
}

function Reword({ path, sha, close, run }: Props & { path: string; sha: string }) {
  const [text, setText] = useState<string | null>(null)
  useEffect(() => {
    let active = true
    void core.commitDetail(path, sha, false).then((d) => { if (active) setText(d.body ? `${d.subject}\n\n${d.body}` : d.subject) },
      (err) => { if (active) { actions.reportError(err, path); close() } })
    return () => { active = false }
  }, [path, sha])
  const valid = text !== null && text.trim() !== ''
  return <>
    <h2 id="commit-dialog-title">Editar mensagem de {sha.slice(0, 7)}</h2>
    <label htmlFor="reword-message">Mensagem</label>
    <textarea id="reword-message" rows={6} autoFocus disabled={text === null} value={text ?? 'Carregando…'} onChange={(e) => setText(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey && valid) run({ type: 'reword', message: text.trim() }) }} />
    <p className="muted">O que está preparado não entra no commit. O hash do commit muda.</p>
    <div className="actions">
      <button onClick={close}>Cancelar</button>
      <button className="primary" disabled={!valid} onClick={() => valid && run({ type: 'reword', message: text.trim() })}>Salvar</button>
    </div>
  </>
}

function FileConfirm({ dialog, close, run }: Props & { dialog: Extract<CommitDialog, { type: 'restoreFile' | 'deleteFile' }> }) {
  const restore = dialog.type === 'restoreFile'
  return <>
    <h2 id="commit-dialog-title">{restore ? 'Restaurar versão deste commit?' : 'Excluir arquivo?'}</h2>
    <p>{restore
      ? <>{dialog.file} volta a ser como era em {dialog.sha.slice(0, 7)}. Mudanças que você fez nele são substituídas.</>
      : <>{dialog.file} sai do diretório de trabalho e do index.</>}</p>
    <p className="muted">Dá para recuperar com Desfazer.</p>
    <div className="actions">
      <button autoFocus onClick={close}>Cancelar</button>
      <button className="primary danger" onClick={() => run(restore ? { type: 'restoreFile', commit: dialog.sha, path: dialog.file } : { type: 'deleteFile', path: dialog.file })}>
        {restore ? 'Restaurar' : 'Excluir'}
      </button>
    </div>
  </>
}
