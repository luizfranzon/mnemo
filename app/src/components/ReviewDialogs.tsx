import { useEffect, useState } from 'react'
import { core } from '../bridge'
import { actions, useApp } from '../store/app'
import { Button } from './Button'
import { Dialog, DialogActions } from './Dialog'
import { TextField } from './Field'

/** Começar Revisão (ou a próxima Rodada) e encerrar. Cancelar nunca muda nada. */
export function ReviewDialogs() {
  const start = useApp((s) => s.reviewPrompt)
  const end = useApp((s) => s.reviewEndPrompt)
  return <>
    {start && <StartReview key={`${start.path}:${start.branch}`} prompt={start} />}
    {end && <EndReview branch={end.branch} />}
  </>
}

function StartReview({ prompt }: { prompt: { path: string; branch: string; base: string; round: number } }) {
  const [base, setBase] = useState(prompt.base)
  const [names, setNames] = useState<string[]>([])
  const [busy, setBusy] = useState(false)
  useEffect(() => {
    void core.listRefs(prompt.path).then((refs) => {
      const remote = refs.remotes.flatMap((g) => [...g.branches, ...g.folders.flatMap((f) => f.branches)]).map((r) => r.name)
      setNames([...new Set([...refs.local.map((b) => b.name), ...remote])].filter((n) => n !== prompt.branch).sort())
    }, () => {})
  }, [])
  const valid = base.trim() !== '' && base.trim() !== prompt.branch
  const confirm = async () => {
    if (!valid || busy) return
    setBusy(true)
    if (!(await actions.startReview(prompt.path, prompt.branch, base.trim()))) setBusy(false)
  }
  const first = prompt.round === 1
  return <Dialog titleId="review-start-title" onCancel={(e) => { e.preventDefault(); if (!busy) actions.cancelReviewPrompt() }}>
    <h2 id="review-start-title">{first ? `Revisar ${prompt.branch}` : `Rodada ${prompt.round} de ${prompt.branch}`}</h2>
    <p>{first ? 'O diff mostra só o que esta branch traz em relação à Base, sem os passos intermediários dos commits.'
      : 'A nova rodada mostra só o que mudou desde a última que você concluiu.'}</p>
    <TextField id="review-base" label="Base" list="review-base-options" autoFocus value={base} disabled={busy} onChange={(e) => setBase(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void confirm() }} onFocus={(e) => e.currentTarget.select()} />
    <datalist id="review-base-options">{names.map((n) => <option key={n} value={n} />)}</datalist>
    {base.trim() === prompt.branch && <p className="warning">A Base precisa ser outra branch.</p>}
    <DialogActions>
      <Button disabled={busy} onClick={actions.cancelReviewPrompt}>Cancelar</Button>
      <Button primary disabled={!valid} loading={busy} onClick={() => void confirm()}>
        {first ? 'Começar revisão' : `Começar rodada ${prompt.round}`}</Button>
    </DialogActions>
  </Dialog>
}

function EndReview({ branch }: { branch: string }) {
  return <Dialog titleId="review-end-title" onCancel={actions.cancelEndReview}>
    <h2 id="review-end-title">Encerrar a revisão de {branch}?</h2>
    <p>As rodadas, as marcações e os comentários somem, e os marcadores saem do grafo. Não dá para desfazer. Copie o relatório antes, se ainda for precisar dele.</p>
    <DialogActions>
      <Button autoFocus onClick={actions.cancelEndReview}>Cancelar</Button>
      <Button primary danger onClick={() => void actions.confirmEndReview()}>Encerrar revisão</Button>
    </DialogActions>
  </Dialog>
}
