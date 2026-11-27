import { useState } from 'react'
import { actions } from '../store/app'
import type { BranchDialog } from './branchMenu'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Dialog, DialogActions } from './Dialog'
import { TextField } from './Field'

/** Renomear e excluir branch. Cancelar (botão, Esc) nunca dispara uma Operação. */
export function BranchDialogs({ path, dialog, close }: { path: string; dialog: BranchDialog; close: () => void }) {
  return <Dialog titleId="branch-dialog-title" onCancel={close}>
    {dialog.type === 'rename' ? <Rename path={path} from={dialog.from} close={close} /> : <Delete path={path} dialog={dialog} close={close} />}
  </Dialog>
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
    <TextField id="branch-new-name" label="Novo nome" autoFocus value={to} onChange={(e) => setTo(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') confirm() }}
      onFocus={(e) => e.currentTarget.select()} />
    <DialogActions>
      <Button onClick={close}>Cancelar</Button>
      <Button primary disabled={!valid} onClick={confirm}>Renomear</Button>
    </DialogActions>
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
  const localLabel = <>Local: {local?.name}{local?.current && <span className="muted"> (branch atual, não dá para excluir)</span>}</>
  return <>
    <h2 id="branch-dialog-title">Excluir branch</h2>
    {local && <Checkbox checked={dropLocal} disabled={local.current} onChange={setDropLocal} label={localLabel} />}
    {remote && <Checkbox checked={dropRemote} onChange={setDropRemote} label={`Remota: ${remote.remote}/${remote.branch}`} />}
    {dropRemote && <p className="warning">A parte remota some do servidor. Não dá para desfazer: mexe no remoto.</p>}
    <DialogActions>
      <Button autoFocus onClick={close}>Cancelar</Button>
      <Button primary danger disabled={none} onClick={() => void confirm()}>Excluir</Button>
    </DialogActions>
  </>
}
