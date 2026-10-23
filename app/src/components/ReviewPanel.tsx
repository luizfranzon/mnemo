import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { Review, ReviewFile, ReviewRound } from '../bridge/types'
import { actions, selectDiff, selectGraphRevision, selectReview, useApp } from '../store/app'
import { Icon, type IconName } from './Icon'
import { copyText } from './menuBase'
import { useModal } from './ReviewDialogs'
import { reportName, reviewReport } from './reviewModel'
import { Segmented } from './Segmented'

const ROW_HEIGHT = 26
const STATUS: Record<string, { icon: IconName; cls: string; label: string }> = {
  A: { icon: 'plus', cls: 'added', label: 'adicionado' }, M: { icon: 'modified', cls: 'modified', label: 'modificado' },
  D: { icon: 'minus', cls: 'removed', label: 'removido' }, R: { icon: 'renamed', cls: 'renamed', label: 'renomeado' },
  C: { icon: 'copy', cls: 'renamed', label: 'copiado' }, T: { icon: 'modified', cls: 'modified', label: 'tipo alterado' },
}
const SCOPES = [{ id: 'round' as const, label: 'Desde a última rodada' }, { id: 'branch' as const, label: 'Branch inteira' }]
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`
const day = (ms: number) => new Date(ms).toLocaleDateString('pt-BR')

/** Painel direito no modo Revisão: progresso da Rodada, arquivos a revisar e o relatório. */
export function ReviewPanel({ path }: { path: string }) {
  const review = useApp(selectReview(path))
  const opened = useApp((s) => { const d = selectDiff(path)(s); return d?.source.kind === 'range' ? d.file.path : null })
  const revision = useApp(selectGraphRevision(path))
  const [hideDone, setHideDone] = useState(false)
  const [confirm, setConfirm] = useState(false)
  const [report, setReport] = useState<{ review: Review; round: ReviewRound } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  // a branch anda (fetch, push de outro dev): os avisos do topo acompanham
  useEffect(() => { void actions.refreshReview(path) }, [revision])
  const round = review?.state.review.rounds.at(-1)
  const files = review && round ? review.state.files.filter((f) => !hideDone || !round.reviewed.includes(f.path)) : []
  const virtual = useVirtualizer({ count: files.length, getScrollElement: () => scroller.current, estimateSize: () => ROW_HEIGHT,
    overscan: 10, getItemKey: (i) => files[i]!.path })
  if (!review || !round) return null
  const { branch, state } = review
  const open = round.concludedMs === null
  const done = state.files.filter((f) => round.reviewed.includes(f.path)).length
  const total = state.files.length
  const missing = total - done
  const noteCount = (file: string) => round.comments.filter((c) => c.file === file).length
  const conclude = async () => {
    setConfirm(false)
    const next = await actions.concludeRound(path)
    if (next) setReport({ review: next, round: next.rounds.at(-1)! })
  }
  const copyReport = () => {
    copyText(reviewReport(state.review, round, state.files))
    actions.info('Relatório copiado', path)
  }
  const openFile = (f: ReviewFile) => { if (!f.reverted) actions.openReviewFile(path, f) }

  return <div className="commit-panel review-panel">
    <div className="commit-head review-head">
      <div className="review-title">
        <Icon name="shown" size={15} />
        <h2 title={branch}>{branch}</h2>
        <span className="muted" title="Base: o diff mostra o que a branch traz em relação a ela">→ {round.base}</span>
      </div>
      <div className="review-round muted">
        Rodada {round.number}{round.from ? ` · desde ${round.from.slice(0, 7)}` : ''}{!open && ` · concluída em ${day(round.concludedMs!)}`}
      </div>
      <div className="review-progress" role="progressbar" aria-label="Arquivos revisados" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
        <div style={{ width: total ? `${(done / total) * 100}%` : 0 }} />
      </div>
      <div className="review-count">{total ? `${done} de ${total} revisados` : 'Nada mudou desde a última rodada'}</div>
    </div>
    {(state.status.rewritten || state.status.ahead > 0) && <p className={state.status.rewritten ? 'review-notice warning' : 'review-notice'}>
      {state.status.rewritten ? 'A branch foi reescrita (rebase ou force push) depois do início desta rodada. A próxima compara o conteúdo, não o histórico.'
        : `${plural(state.status.ahead, 'commit novo chegou', 'commits novos chegaram')} depois do início desta rodada.${open ? ' Eles entram na próxima.' : ''}`}
      {!open && <button onClick={() => void actions.requestReview(path, branch)}>Começar rodada {round.number + 1}</button>}</p>}
    {state.status.tip === null && <p className="review-notice warning">{branch} não existe mais aqui nem no remoto.</p>}
    {state.status.merged && <p className="review-notice">{branch} já entrou em {round.base}.
      <button onClick={() => actions.requestEndReview(path, branch)}>Encerrar revisão</button></p>}
    <div className="commit-tools">
      {round.from && <Segmented label="Diff mostrado" options={SCOPES} value={review.scope} onChange={(s) => actions.setReviewScope(path, s)} />}
      <span className="spacer" />
      <label><input type="checkbox" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Esconder revisados</label>
    </div>
    <div className="commit-files" ref={scroller}>
      {!files.length && <p className="review-empty muted">{total ? 'Todos os arquivos foram revisados.' : 'Nenhum arquivo para revisar nesta rodada.'}</p>}
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const f = files[item.index]!
          const st = STATUS[f.status] ?? STATUS.M!
          const slash = f.path.lastIndexOf('/')
          const checked = round.reviewed.includes(f.path)
          const notes = noteCount(f.path)
          const title = f.reverted ? `${f.path}: voltou a ficar igual a ${round.base} desde a rodada anterior` : `${f.oldPath ? `${f.oldPath} → ` : ''}${f.path} (${st.label})`
          return <div key={f.path} className={`commit-file review-file${opened === f.path ? ' active' : ''}${checked ? ' done' : ''}${f.reverted ? ' reverted' : ''}`}
            style={{ transform: `translateY(${item.start}px)`, height: ROW_HEIGHT }} title={title}
            role={f.reverted ? undefined : 'button'} tabIndex={f.reverted ? undefined : 0} onClick={() => openFile(f)}
            onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); openFile(f) } }}>
            <input type="checkbox" aria-label={`Revisado: ${f.path}`} checked={checked} disabled={!open}
              onClick={(e) => e.stopPropagation()} onChange={(e) => void actions.markReviewed(path, f.path, e.target.checked)} />
            <span className={`commit-status ${st.cls}`}><Icon name={st.icon} size={12} strokeWidth={2.2} /></span>
            <span className="commit-path"><span className="commit-dirpath">{f.path.slice(0, slash + 1)}</span><span className="commit-name">{f.path.slice(slash + 1)}</span></span>
            {f.reverted ? <span className="review-tag">revertido</span>
              : f.added !== null && <span className="mono commit-lines"><span className="added">+{f.added}</span> <span className="removed">−{f.removed}</span></span>}
            {notes > 0 && <span className="count-badge gray" title={plural(notes, 'comentário', 'comentários')}>{notes}</span>}
          </div>
        })}
      </div>
    </div>
    <div className="review-actions">
      <button onClick={copyReport} title="Arquivo, trecho e comentário de cada anotação, em Markdown">
        <Icon name="copy" size={13} /> Copiar relatório</button>
      <span className="spacer" />
      {open ? <button className="primary" onClick={() => (missing > 0 ? setConfirm(true) : void conclude())}>Concluir rodada</button>
        : <button onClick={() => setReport({ review: state.review, round })}>Ver relatório</button>}
    </div>
    {confirm && <ConfirmConclude missing={missing} onCancel={() => setConfirm(false)} onConfirm={() => void conclude()} />}
    {report && <ReportDialog path={path} review={report.review} round={report.round} files={state.files} onClose={() => setReport(null)} />}
  </div>
}

function ConfirmConclude({ missing, onCancel, onConfirm }: { missing: number; onCancel: () => void; onConfirm: () => void }) {
  const ref = useModal()
  return <dialog ref={ref} className="push-dialog card" aria-labelledby="review-conclude-title" onCancel={onCancel}>
    <h2 id="review-conclude-title">Concluir a rodada?</h2>
    <p>{plural(missing, 'arquivo ainda não foi revisado', 'arquivos ainda não foram revisados')}. Depois de concluir, os comentários desta rodada não mudam mais.</p>
    <div className="actions">
      <button autoFocus onClick={onCancel}>Continuar revisando</button>
      <button className="primary" onClick={onConfirm}>Concluir mesmo assim</button>
    </div>
  </dialog>
}

function ReportDialog({ path, review, round, files, onClose }: { path: string; review: Review; round: ReviewRound; files: ReviewFile[]; onClose: () => void }) {
  const ref = useModal()
  const text = reviewReport(review, round, files)
  const save = async () => {
    try {
      const saved = await core.saveText(reportName(review.branch, round.number), text)
      if (saved) actions.info(`Relatório salvo em ${saved}`, path)
    } catch (err) { actions.reportError(err, path) }
  }
  return <dialog ref={ref} className="push-dialog card review-report" aria-labelledby="review-report-title" onCancel={onClose}>
    <h2 id="review-report-title">Relatório da rodada {round.number}</h2>
    <pre className="review-report-text" tabIndex={0}>{text}</pre>
    <div className="actions">
      <button onClick={onClose}>Fechar</button>
      <button onClick={() => void save()}>Salvar .md</button>
      <button className="primary" autoFocus onClick={() => { copyText(text); actions.info('Relatório copiado', path) }}>Copiar</button>
    </div>
  </dialog>
}
