import { useEffect, useRef, useState } from 'react'
import { actions } from '../store/app'
import type { BranchDialog } from './branchMenu'

/** Renomear e excluir branch. Cancelar (botão, Esc) nunca dispara uma Operação. */
export function BranchDialogs({ path, dialog, close }: { path: string; dialog: BranchDialog; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="branch-dialog-title" onCancel={close}>
    {dialog.type === 'rename' ? <Rename path={path} from={dialog.from} close={close} /> : <Delete path={path} dialog={dialog} close={close} />}
  </dialog>
}

function Rename({ path, from, close }: { path: string; from: string; close: () => void }) {
  const [to, setTo] = useState(from)
  const valid = to.trim() !== '' && to.trim() !== from
  const confirm = () => {
    if (!valid) return
    close()
    void actions.execute(path, { type: 'branchRename', from, to: to.trim() })
  }
  return <>
    <h2 id="branch-dialog-title">Renomear {from}</h2>
    <label htmlFor="branch-new-name">Novo nome</label>
    <input id="branch-new-name" autoFocus value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
      onFocus={(e) => e.currentTarget.select()} />
    <div className="actions">
      <button onClick={close}>Cancelar</button>
      <button className="primary" disabled={!valid} onClick={confirm}>Renomear</button>
    </div>
  </>
}

function Delete({ path, dialog, close }: { path: string; dialog: Extract<BranchDialog, { type: 'delete' }>; close: () => void }) {
  const { local, remote } = dialog
  const [dropLocal, setDropLocal] = useState(dialog.from === 'local' && !!local && !local.current)
  const [dropRemote, setDropRemote] = useState(dialog.from === 'remote' && !!remote)
  const none = !dropLocal && !dropRemote
  const confirm = async () => {
    close()
    if (dropLocal && local) await actions.execute(path, { type: 'branchDelete', name: local.name, force: false })
    if (dropRemote && remote) await actions.execute(path, { type: 'deleteRemoteBranch', remote: remote.remote, branch: remote.branch })
  }
  return <>
    <h2 id="branch-dialog-title">Excluir branch</h2>
    {local && <label><input type="checkbox" checked={dropLocal} disabled={local.current} onChange={(e) => setDropLocal(e.target.checked)} /> Local: {local.name}
      {local.current && <span className="muted"> (branch atual, não dá para excluir)</span>}</label>}
    {remote && <label><input type="checkbox" checked={dropRemote} onChange={(e) => setDropRemote(e.target.checked)} /> Remota: {remote.remote}/{remote.branch}</label>}
    {dropRemote && <p className="warning">A parte remota some do servidor. Não dá para desfazer: mexe no remoto.</p>}
    <div className="actions">
      <button autoFocus onClick={close}>Cancelar</button>
      <button className="primary danger" disabled={none} onClick={() => void confirm()}>Excluir</button>
    </div>
  </>
}
