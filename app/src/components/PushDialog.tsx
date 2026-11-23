import { useState } from 'react'
import { actions, useApp } from '../store/app'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'

/** O diálogo nativo contém o foco; cancelar nunca dispara uma Operação. */
export function PushDialog() {
  const prompt = useApp((s) => s.pushPrompt)
  return prompt && <ChooseRemote key={`${prompt.path}:${prompt.branch}`} prompt={prompt} />
}

function ChooseRemote({ prompt }: { prompt: { path: string; branch: string; remotes: string[] } }) {
  const [remote, setRemote] = useState(prompt.remotes[0] ?? '')
  return (
    <Dialog titleId="push-remote-title" onCancel={actions.cancelPush}>
      <h2 id="push-remote-title">Publicar {prompt.branch}</h2>
      <p>Escolha o remoto. A branch passará a rastrear {remote}/{prompt.branch}.</p>
      <label htmlFor="push-remote">Remoto</label>
      <select id="push-remote" autoFocus value={remote} onChange={(e) => setRemote(e.target.value)}>
        {prompt.remotes.map((name) => <option key={name} value={name}>{name}</option>)}
      </select>
      <DialogActions>
        <Button onClick={actions.cancelPush}>Cancelar</Button>
        <Button primary disabled={!remote} onClick={() => void actions.confirmPush(remote)}>Push {prompt.branch}</Button>
      </DialogActions>
    </Dialog>
  )
}
