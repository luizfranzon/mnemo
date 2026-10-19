import { useVirtualizer } from '@tanstack/react-virtual'
import { useCallback, useEffect, useMemo, useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { core } from '../bridge'
import type { ConflictChoice, ConflictDoc, ConflictFile, SideLabel } from '../bridge/types'
import { actions, isActiveTab, selectConflict, selectWipRevision, useApp } from '../store/app'
import {
  chunkStarts, conflictsOf, fileSideState, initialPicks, output, outputWithMarkers, paneRows, resultLayout, sideState, taken, toggleFileSide, toggleLine, toggleSide, unresolved,
  type Pick, type PaneRow, type Side, type State,
} from './conflictModel'
import { highlightLines, type Part } from './syntax'
import { selectSide } from './selectSide'
import { ResultEditor, type ResultHandle } from './ResultEditor'
import { Icon } from './Icon'

const ROW = 20
const SIDES = ['ours', 'theirs'] as const
const NAME = { ours: 'Atual', theirs: 'Entrando' } as const
const LETTER = { ours: 'A', theirs: 'B' } as const

/** Checkbox de três estados: `some` fica indeterminado. */
function TriBox({ state, label, disabled, onChange }: { state: State; label: string; disabled: boolean; onChange: () => void }) {
  return <input type="checkbox" aria-label={label} title={label} disabled={disabled} checked={state === 'all'} onChange={onChange}
    ref={(el) => { if (el) el.indeterminate = state === 'some' }} />
}
const labelOf = (l: SideLabel | null) => (l ? <span className="muted"> commit {l.sha}{l.name && <> em <em>{l.name}</em></>}</span> : null)
const KIND: Record<ConflictFile['kind'], string> = {
  both: 'modificado nos dois lados', bothAdded: 'adicionado nos dois lados', deletedByUs: 'apagado no Atual e modificado no que entra',
  deletedByThem: 'modificado no Atual e apagado no que entra', addedByUs: 'adicionado no Atual', addedByThem: 'adicionado no que entra', bothDeleted: 'apagado nos dois lados',
}

/** Resolve um arquivo em conflito: Atual × Entrando por trecho/linha, Resultado editável. */
export function ConflictEditor({ path }: { path: string }) {
  const target = useApp(selectConflict(path))
  const revision = useApp(selectWipRevision(path))
  const file = target?.file ?? ''
  const [info, setInfo] = useState<ConflictFile | null>(null)
  const [doc, setDoc] = useState<ConflictDoc | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [manual, setManual] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [ask, setAsk] = useState(false)
  const main = useRef<HTMLDivElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const result = useRef<ResultHandle | null>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    setInfo(null); setDoc(null); setManual(null); setCurrent(0)
    void core.conflictList(path).then(async (list) => {
      if (!active) return
      const f = list.find((c) => c.path === file) ?? null
      if (!f) return actions.closeConflict(path) // já resolvido (fora do editor ou por Continuar)
      setInfo(f)
      if (f.binary || (f.kind !== 'both' && f.kind !== 'bothAdded')) return
      const d = await core.conflictFile(path, file)
      if (!active) return
      setDoc(d); setPicks(initialPicks(d))
    }).catch((err) => { if (active) actions.reportError(err) })
    return () => { active = false }
  }, [path, file, revision])

  useEffect(() => {
    if (ask) dialog.current?.showModal()
    else dialog.current?.close()
  }, [ask])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isActiveTab(path) || e.key !== 'Escape' || e.defaultPrevented || ask || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      actions.closeConflict(path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ask])

  const done = () => { actions.wipChanged(path); actions.closeConflict(path) }
  const fail = actions.reportError
  const take = (choice: ConflictChoice) => void core.conflictTake(path, file, choice).then(done, fail)
  const save = (markers: boolean) => {
    if (!doc) return
    void core.conflictSave(path, file, manual ?? (markers ? outputWithMarkers(doc, picks) : output(doc, picks)), !markers).then(done, fail)
  }
  // useMemo manual: o Compiler pula componente com useVirtualizer, e sem isso o parse do arquivo inteiro roda a cada frame de scroll
  const chunks = useMemo(() => (doc ? conflictsOf(doc) : []), [doc])
  const rows = useMemo(() => (doc ? paneRows(doc) : []), [doc])
  const starts = useMemo(() => chunkStarts(rows), [rows])
  /** Cada lado parseado inteiro; o índice é o número da linha no lado menos 1. */
  const parts = useMemo(() => ({ ours: highlightLines(rows.flatMap((r) => (r.ours ? [r.ours.text] : [])).join('\n'), file), theirs: highlightLines(rows.flatMap((r) => (r.theirs ? [r.theirs.text] : [])).join('\n'), file) }), [rows, file])
  const lay = useMemo(() => (doc ? resultLayout(doc, picks) : null), [doc, picks])
  const merged = useMemo(() => (doc ? output(doc, picks) : ''), [doc, picks])
  const pending = unresolved(picks)
  const autoCount = chunks.filter((c) => c.auto).length
  const locked = manual !== null
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 20, estimateSize: () => ROW })
  const goto = (n: number) => {
    const next = Math.min(Math.max(n, 0), chunks.length - 1)
    setCurrent(next)
    if (starts[next] !== undefined) virtual.scrollToIndex(starts[next]!, { align: 'center' })
    if (lay?.starts[next] !== undefined) result.current?.reveal(lay.starts[next]!)
  }
  // estável entre renders do scroll, senão toda ConflictRowView desenha de novo
  const change = useCallback((n: number, fn: (p: Pick) => Pick) => { setManual(null); setCurrent(n); setPicks((all) => all.map((p, i) => (i === n ? fn(p) : p))) }, [])
  const reset = () => { setManual(null); setPicks(initialPicks(doc!)) }

  /** Arrasto a 60fps só mexe na CSS variable; a altura não é guardada. */
  const dragSplit = (e: ReactPointerEvent<HTMLDivElement>) => {
    const box = main.current
    if (!box || e.button !== 0) return
    e.preventDefault()
    const handle = e.currentTarget
    handle.setPointerCapture(e.pointerId)
    handle.classList.add('dragging')
    const rect = box.getBoundingClientRect()
    const onMove = (ev: PointerEvent) => box.style.setProperty('--conflict-top', `${Math.min(85, Math.max(15, ((ev.clientY - rect.top) / rect.height) * 100))}%`)
    handle.addEventListener('pointermove', onMove)
    handle.addEventListener('lostpointercapture', () => { handle.removeEventListener('pointermove', onMove); handle.classList.remove('dragging') }, { once: true })
  }

  return <div className="diff-view conflict-view">
    <div className="diff-head">
      <div className="diff-crumb"><span>{file}</span> <span className="diff-side">{info ? KIND[info.kind] : ''}</span></div>
      <button className="diff-close" aria-label="Fechar editor de conflito (Esc)" title="Fechar (Esc)" onClick={() => actions.closeConflict(path)}>×</button>
    </div>
    {info && !doc && <div className="conflict-choices">
      <p>{info.binary ? 'Arquivo binário: escolha uma das versões.' : `${file}: ${KIND[info.kind]}.`}</p>
      <div className="actions">
        {info.kind !== 'both' && info.kind !== 'bothAdded' && !info.binary && info.kind !== 'addedByUs' && info.kind !== 'addedByThem' && <button onClick={() => take('base')}>Manter a versão base</button>}
        {info.kind !== 'deletedByUs' && info.kind !== 'addedByThem' && <button onClick={() => take('ours')}>Usar o atual</button>}
        {info.kind !== 'deletedByThem' && info.kind !== 'addedByUs' && <button onClick={() => take('theirs')}>Usar o que entra</button>}
        {!info.binary && <button onClick={() => take('delete')}>Apagar o arquivo</button>}
      </div>
    </div>}
    {doc && lay && <div className="conflict-main" ref={main}>
      <div className="conflict-top">
        <div className="conflict-heads">
          {SIDES.map((side) => <div key={side} className={`conflict-head ${side}`}>
            <TriBox state={fileSideState(picks, chunks, side)} disabled={locked} label={`Pegar tudo de ${NAME[side]}`} onChange={() => { setManual(null); setPicks((all) => toggleFileSide(all, chunks, side)) }} />
            <span className="conflict-letter">{LETTER[side]}</span>
            <span>{NAME[side]}{labelOf(doc[`${side}Label`])}</span>
          </div>)}
        </div>
        <div className="diff-scroll split" ref={scroller} onPointerDown={selectSide}>
          <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
            {virtual.getVirtualItems().map((item) => {
              const r = rows[item.index]!
              return <div key={item.key} className="diff-row" style={{ transform: `translateY(${item.start}px)`, height: item.size }}>
                <ConflictRowView r={r} parts={parts} picks={picks} chunks={chunks} locked={locked} onChange={change} />
              </div>
            })}
          </div>
        </div>
      </div>
      <div className="conflict-split" role="separator" aria-orientation="horizontal" aria-label="Redimensionar o Resultado" onPointerDown={dragSplit}
        onDoubleClick={() => main.current?.style.removeProperty('--conflict-top')} />
      <div className="conflict-result">
        <div className="diff-tools">
          <strong>Resultado</strong>
          <span className="muted">{locked ? 'editado à mão: Reset volta para a escolha por linhas' : pending > 0 ? `${pending} sem escolha` : 'todos os conflitos resolvidos'}{autoCount > 0 && !locked ? ` · ${autoCount} só de espaço em branco (Atual escolhido)` : ''}</span>
          <span className="spacer" />
          {chunks.length > 0 && <>
            <button className="diff-nav" aria-label="Conflito anterior" disabled={current <= 0} onClick={() => goto(current - 1)}>‹</button>
            <span className="muted">conflito {current + 1} de {chunks.length}</span>
            <button className="diff-nav" aria-label="Próximo conflito" disabled={current >= chunks.length - 1} onClick={() => goto(current + 1)}>›</button>
          </>}
          <span className="spacer" />
          <button onClick={() => void core.conflictMergetool(path, file).then(() => actions.wipChanged(path), fail)}>Abrir na ferramenta externa</button>
          <button onClick={reset}>Reset</button>
          <button className="primary" onClick={() => (pending > 0 && !locked ? setAsk(true) : save(false))}>Salvar</button>
        </div>
        <ResultEditor key={file} file={file} value={manual ?? merged} layout={locked ? null : lay} onChange={setManual} handle={result} />
      </div>
      <dialog ref={dialog} className="push-dialog card" aria-labelledby="conflict-ask" onCancel={() => setAsk(false)}>
        <h2 id="conflict-ask">Há {pending} conflito(s) sem escolha</h2>
        <p>Dá para gravar o arquivo com os marcadores <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> e resolver depois. O arquivo gravado difere do Resultado exibido, e continua em conflito até você resolvê-lo.</p>
        <div className="actions">
          <button onClick={() => setAsk(false)}>Voltar</button>
          <button className="primary" autoFocus onClick={() => { setAsk(false); save(true) }}>Gravar com marcadores</button>
        </div>
      </dialog>
    </div>}
  </div>
}

interface RowProps {
  r: PaneRow; parts: Record<Side, Part[][]>; picks: Pick[]; chunks: ReturnType<typeof conflictsOf>; locked: boolean
  onChange: (n: number, fn: (p: Pick) => Pick) => void
}

/** Uma linha Atual × Entrando. Componente à parte para o Compiler reaproveitar as linhas que já estavam na tela durante o scroll. */
function ConflictRowView({ r, parts, picks, chunks, locked, onChange }: RowProps) {
  const half = (side: Side) => {
    const cell = r[side]
    const hot = r.chunk !== null
    const n = r.chunk ?? 0
    const on = hot && cell?.i != null && taken(picks[n]!, side, cell.i)
    return <div className={`conflict-half ${side}${hot && cell ? ' hot' : ''}${cell ? '' : ' diff-empty'}`}>
      <span className="conflict-chk">{hot && r.first && cell && <TriBox state={sideState(picks[n]!, chunks[n]!, side)} disabled={locked}
        label={`Pegar o trecho inteiro de ${NAME[side]}`} onChange={() => onChange(n, (p) => toggleSide(p, chunks[n]!, side))} />}</span>
      <span className="diff-num">{cell?.n ?? ''}</span>
      <span className="conflict-take">{hot && cell && cell.i !== null && <button className={on ? 'on' : ''} aria-pressed={on} disabled={locked}
        title={on ? 'Tirar esta linha do Resultado' : 'Pegar esta linha'} aria-label={`Pegar linha ${cell.n} de ${NAME[side]}`}
        onClick={() => onChange(n, (p) => toggleLine(p, side, cell.i!))}><Icon name={on ? 'check' : 'plus'} size={12} strokeWidth={2.2} /></button>}</span>
      {cell && <span className="diff-code">{(parts[side][cell.n - 1] ?? []).map((p, k) => <span key={k} className={`syn-${p.c}`}>{p.t}</span>)}</span>}
    </div>
  }

  return <div className="diff-split">{half('ours')}{half('theirs')}</div>
}
