import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import { actions, useApp } from '../store/app'

/** Começar Revisão (ou a próxima Rodada) e encerrar. Cancelar nunca muda nada. */
export function ReviewDialogs() {
  const start = useApp((s) => s.reviewPrompt)
  const end = useApp((s) => s.reviewEndPrompt)
  return <>
    {start && <StartReview key={`${start.path}:${start.branch}`} prompt={start} />}
    {end && <EndReview branch={end.branch} />}
  </>
}

/** `<dialog>` modal enquanto o componente existe. */
export function useModal() {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return ref
}

function StartReview({ prompt }: { prompt: { path: string; branch: string; base: string; round: number } }) {
  const ref = useModal()
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
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="review-start-title" onCancel={(e) => { e.preventDefault(); if (!busy) actions.cancelReviewPrompt() }}>
    <h2 id="review-start-title">{first ? `Revisar ${prompt.branch}` : `Rodada ${prompt.round} de ${prompt.branch}`}</h2>
    <p>{first ? 'O diff mostra só o que esta branch traz em relação à Base, sem os passos intermediários dos commits.'
      : 'A nova rodada mostra só o que mudou desde a última que você concluiu.'}</p>
    <label htmlFor="review-base">Base</label>
    <input id="review-base" list="review-base-options" autoFocus value={base} disabled={busy} onChange={(e) => setBase(e.target.value)}
      onKeyDown={(e) => { if (e.key === 'Enter') void confirm() }} onFocus={(e) => e.currentTarget.select()} />
    <datalist id="review-base-options">{names.map((n) => <option key={n} value={n} />)}</datalist>
    {base.trim() === prompt.branch && <p className="warning">A Base precisa ser outra branch.</p>}
    <div className="actions">
      <button disabled={busy} onClick={actions.cancelReviewPrompt}>Cancelar</button>
      <button className="primary" disabled={!valid || busy} onClick={() => void confirm()}>
        {busy ? `Buscando ${prompt.branch}…` : first ? 'Começar revisão' : `Começar rodada ${prompt.round}`}</button>
    </div>
  </dialog>
}

function EndReview({ branch }: { branch: string }) {
  const ref = useModal()
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="review-end-title" onCancel={actions.cancelEndReview}>
    <h2 id="review-end-title">Encerrar a revisão de {branch}?</h2>
    <p>As rodadas, as marcações e os comentários somem, e os marcadores saem do grafo. Não dá para desfazer. Copie o relatório antes, se ainda for precisar dele.</p>
    <div className="actions">
      <button autoFocus onClick={actions.cancelEndReview}>Cancelar</button>
      <button className="primary danger" onClick={() => void actions.confirmEndReview()}>Encerrar revisão</button>
    </div>
  </dialog>
}
