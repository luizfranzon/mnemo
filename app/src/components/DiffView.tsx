import { useVirtualizer } from '@tanstack/react-virtual'
import { EncodingPicker } from './EncodingPicker'
import { FindBar, focusFind, useFindHighlight, useFindShortcut } from './FindBar'
import { Icon, type IconName } from './Icon'
import { Code, SplitScroll } from './SplitScroll'
import { Segmented } from './Segmented'
import { useCallback, useEffect, useMemo, useRef, useState, type MouseEvent } from 'react'
import { core } from '../bridge'
import type { DiffLine, DiffSource, FileDiff, ReviewComment } from '../bridge/types'
import { actions, isActiveTab, selectDiff, selectReview, selectWipRevision, useApp } from '../store/app'
import type { Rect } from './menuModel'
import { diffParts, type Part } from './syntax'
import { diffRows, findRows, hunkAt, hunkLines, hunkRows, LAYOUTS, markers, selectionArgs, type DiffLayout, type DiffRow } from './diffModel'
import { anchorOf, lineLabel, reviewRows, visibleComments, type Draft } from './reviewModel'

const LINE = 20
const HUNK = 28
const NOTE = 96
const LAYOUT_KEY = 'mnemo.diff.layout'
const GLYPH: Record<string, { icon: IconName; cls: string }> = {
  A: { icon: 'plus', cls: 'added' }, M: { icon: 'modified', cls: 'modified' }, T: { icon: 'modified', cls: 'modified' }, U: { icon: 'unchanged', cls: 'plain' },
  D: { icon: 'minus', cls: 'removed' }, R: { icon: 'renamed', cls: 'renamed' }, C: { icon: 'copy', cls: 'renamed' },
}
const loadLayout = (): DiffLayout => {
  try { const l = localStorage.getItem(LAYOUT_KEY); return l === 'inline' || l === 'split' ? l : 'hunks' } catch { return 'hunks' }
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Diff de um arquivo no centro. No WIP, prepara/tira trecho ou linhas escolhidas. */
export function DiffView({ path }: { path: string }) {
  const target = useApp(selectDiff(path))
  const revision = useApp(selectWipRevision(path))
  const [layout, setLayout] = useState(loadLayout)
  const [diff, setDiff] = useState<FileDiff | null>(null)
  // a escolha vale só para este arquivo/fonte; ao trocar de diff volta para Adivinhar
  const [pick, setPick] = useState<{ source: DiffSource | undefined; file: string; id: string } | null>(null)
  const [encAnchor, setEncAnchor] = useState<Rect | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [current, setCurrent] = useState(0)
  const [find, setFind] = useState<{ text: string; at: number } | null>(null)
  const anchor = useRef<number | null>(null)
  const loaded = useRef<{ diff: FileDiff; source: DiffSource; layout: DiffLayout } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)
  const source = target?.source
  const file = target?.file.path ?? ''
  const encoding = pick && pick.source === source && pick.file === file ? pick.id : 'guess'
  const wip = source?.kind === 'unstaged' || source?.kind === 'staged'
  const canStage = wip && (diff?.stageable ?? true)
  const unstage = source?.kind === 'staged'
  // Revisão: clicar no número da linha escolhe o trecho (Shift estende) e abre a caixa de comentário logo abaixo
  const review = useApp(selectReview(path))
  const round = source?.kind === 'range' ? review?.state.review.rounds.at(-1) : undefined
  const editable = !!round && round.concludedMs === null
  const [range, setRange] = useState<{ from: number; to: number; side?: 'old' | 'new' } | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [note, setNote] = useState('')
  /** Texto do código selecionado com o mouse: o botão flutuante comenta as linhas dele. */
  const [textPick, setTextPick] = useState<{ from: number; to: number; side?: 'old' | 'new'; label: string; x: number; y: number } | null>(null)
  // o trecho escolhido são índices deste diff: outro arquivo, layout ou codificação o invalida
  useEffect(() => { setRange(null); setDraft(null); setTextPick(null) }, [file, source, layout, encoding])

  useEffect(() => {
    if (!source) return
    let active = true
    void core.fileDiff(path, file, source, layout !== 'hunks', encoding).then((next) => {
      if (!active) return
      // reler o mesmo diff (foco da janela, preparar) mantém as linhas escolhidas que continuam iguais
      const old = loaded.current
      const same = (i: number) => old?.source === source && old.layout === layout
        && old.diff.lines[i]?.kind === next.lines[i]?.kind && old.diff.lines[i]?.text === next.lines[i]?.text
      loaded.current = { diff: next, source, layout }
      setDiff(next)
      setSelected((sel) => new Set([...sel].filter(same)))
    }, (err) => { if (active) actions.reportError(err, path) })
    return () => { active = false }
  }, [path, file, source, layout, encoding, wip ? revision : 0])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (!isActiveTab(path) || e.key !== 'Escape' || e.defaultPrevented || typing || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      e.preventDefault() // o Esc fechou algo daqui: a busca do grafo, por baixo, espera o próximo
      if (find) setFind(null)
      else actions.closeDiff(path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [!find])

  // useMemo manual: o Compiler pula componente com useVirtualizer, e sem isso o parse do arquivo inteiro roda a cada frame de scroll
  const lines = useMemo(() => (diff && !diff.binary && !diff.tooLarge ? diffRows(diff, layout) : []), [diff, layout])
  const comments = useMemo(() => (round && review ? visibleComments(round.comments, file, review.scope) : NO_COMMENTS), [round, review?.scope, file])
  const rows = useMemo(() => (round && diff && lines.length ? reviewRows(lines, diff, comments, draft) : lines), [lines, round, diff, comments, draft])
  const picked = useMemo(() => {
    if (!range) return selected
    const all = new Set<number>()
    for (let k = Math.min(range.from, range.to); k <= Math.max(range.from, range.to); k++) all.add(k)
    return all
  }, [range, selected])
  const heads = useMemo(() => hunkRows(rows), [rows])
  const parts = useMemo(() => (rows.length ? diffParts(diff!) : []), [diff, rows])
  // largura de meia tela no split: a linha mais longa em colunas (fonte mono), para as duas metades rolarem juntas
  const cols = useMemo(() => (diff ? diff.lines.reduce((m, l) => Math.max(m, l.text.length), 0) : 0), [diff])
  const marks = useMemo(() => (diff ? markers(diff, rows) : []), [diff, rows])
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 20,
    estimateSize: (i) => (rows[i]?.type === 'hunk' ? HUNK : isNote(rows[i]) ? NOTE : LINE), getItemKey: (i) => rows[i]!.key })
  const needle = find?.text.trim().toLocaleLowerCase() ?? ''
  const hits = useMemo(() => (diff ? findRows(diff, rows, needle) : []), [diff, rows, needle])
  const hit = find && hits.length ? hits[Math.min(find.at, hits.length - 1)] : undefined
  useFindHighlight(scroller, needle)
  useFindShortcut(path, () => { setFind((f) => f ?? { text: '', at: 0 }); focusFind(root) })
  const seek = (text: string, at: number) => {
    const all = diff ? findRows(diff, rows, text.trim().toLocaleLowerCase()) : []
    const next = all.length ? (at + all.length) % all.length : 0
    setFind({ text, at: next })
    if (all.length) virtual.scrollToIndex(all[next]!, { align: 'center' })
  }

  const pickLayout = (next: DiffLayout) => { setLayout(next); try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* sem storage */ } }
  const goTo = (n: number) => { if (heads[n] !== undefined) virtual.scrollToIndex(heads[n]!, { align: 'start' }); setCurrent(n) }
  const onScroll = () => {
    const at = virtual.getVirtualItemForOffset(scroller.current?.scrollTop ?? 0)?.index ?? 0
    setCurrent(hunkAt(heads, at + 1))
  }
  // estáveis entre renders do scroll, senão toda DiffRowView desenha de novo
  const stage = useCallback((lines: number[]) => {
    if (!diff) return
    void core.stageLines(path, file, unstage, selectionArgs(diff, new Set(lines))).then(() => {
      setSelected(new Set()); actions.wipChanged(path)
    }, (err) => actions.reportError(err, path))
  }, [diff, path, file, unstage])
  const toggle = useCallback((i: number, e: MouseEvent) => {
    if (!diff) return
    setSelected((old) => {
      const next = new Set(old)
      if (e.shiftKey && anchor.current !== null) {
        const [a, b] = [Math.min(anchor.current, i), Math.max(anchor.current, i)]
        for (let k = a; k <= b; k++) if (diff.lines[k]!.kind !== 'context' && diff.lines[k]!.hunk !== null) next.add(k)
      } else if (next.has(i)) next.delete(i)
      else next.add(i)
      return next
    })
    anchor.current = i
  }, [diff])
  // arrastar pelos números escolhe várias linhas; a caixa abre ao soltar. O ref evita ler um trecho velho entre dois eventos do arrasto.
  const rangeRef = useRef<typeof range>(null)
  const dragging = useRef(false)
  const pickLine = useCallback((i: number, side: 'old' | 'new' | undefined, how: Pick) => {
    const cur = rangeRef.current
    if (how === 'extend' && (!dragging.current || cur?.side !== side)) return
    const next = (how === 'extend' || how === 'shift') && cur && cur.side === side ? { ...cur, to: i } : { from: i, to: i, side }
    rangeRef.current = next
    setRange(next)
    const open = () => {
      const r = rangeRef.current
      const anchor = diff && r && anchorOf(diff, r.from, r.to, r.side)
      if (!r || !anchor?.lines) return
      if (draft?.id) setNote('')
      setDraft({ id: null, end: Math.max(r.from, r.to), side: anchor.lines.side })
    }
    if (how === 'start') {
      dragging.current = true
      window.addEventListener('pointerup', () => { dragging.current = false; open() }, { once: true })
    } else if (how !== 'extend') open()
  }, [diff, draft])
  useEffect(() => {
    if (!editable) return
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (!isActiveTab(path) || typing || e.ctrlKey || e.metaKey || e.altKey || e.key.toLowerCase() !== 'v' || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      e.preventDefault()
      void actions.markReviewed(path, file, !round.reviewed.includes(file), true)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [editable, file, round?.reviewed])
  if (!target || !source) return null
  const cancelNote = () => { setDraft(null); setRange(null); rangeRef.current = null; setNote('') }
  const fromSelection = (e: MouseEvent<HTMLDivElement>) => {
    const sel = window.getSelection()
    const line = (n: Node | null) => (n instanceof Element ? n : n?.parentElement)?.closest<HTMLElement>('[data-line]')
    const [a, b] = sel && !sel.isCollapsed ? [line(sel.anchorNode), line(sel.focusNode)] : [null, null]
    const side = a?.dataset.side as 'old' | 'new' | undefined
    const anchor = diff && a && b && anchorOf(diff, Number(a.dataset.line), Number(b.dataset.line), side)
    if (!sel || !a || !b || !anchor?.lines) return setTextPick(null)
    const box = e.currentTarget.getBoundingClientRect()
    const end = sel.getRangeAt(sel.rangeCount - 1).getBoundingClientRect()
    setTextPick({ from: Number(a.dataset.line), to: Number(b.dataset.line), side, label: lineLabel(anchor.lines),
      x: Math.min(end.right - box.left + 8, box.width - 160), y: end.bottom - box.top + 4 })
  }
  const saveNote = async () => {
    if (!round || !review || !draft || !diff) return
    const existing = draft.id ? round.comments.find((c) => c.id === draft.id) : undefined
    const anchor = existing ?? (draft.end === null ? { lines: null, snippet: [] } : range && anchorOf(diff, range.from, range.to, range.side))
    if (!anchor) return
    const saved = await actions.saveComment(path, { id: existing?.id ?? noteId(), file, oldPath: target.file.oldPath, lines: anchor.lines, snippet: anchor.snippet,
      body: note, scope: existing?.scope ?? review.scope })
    if (saved) cancelNote()
  }
  const editNote = (c: ReviewComment) => {
    const end = c.lines ? diff?.lines.findIndex((l) => (c.lines!.side === 'new' ? l.new : l.old) === c.lines!.end) ?? -1 : null
    setRange(null)
    rangeRef.current = null
    setNote(c.body)
    setDraft({ id: c.id, end: end !== null && end >= 0 ? end : null, side: c.lines?.side ?? 'new' })
  }
  const draftLabel = !draft ? '' : draft.id ? lineLabel(round?.comments.find((c) => c.id === draft.id)?.lines ?? null)
    : draft.end === null ? lineLabel(null) : lineLabel((diff && range && anchorOf(diff, range.from, range.to, range.side)?.lines) || null)
  // lado a lado: o card fica na metade do lado comentado (código novo à direita)
  const half = (side: 'old' | 'new' | undefined, whole: boolean) => (layout !== 'split' || whole ? '' : side === 'old' ? 'left' : 'right')
  const composer = draft && <Composer half={half(draft.side, draft.end === null)} label={draftLabel} text={note} editing={!!draft.id} onText={setNote} onCancel={cancelNote} onSave={() => void saveNote()} />
  const noteCard = (id: string) => {
    const c = round?.comments.find((x) => x.id === id)
    return c && <NoteCard c={c} half={half(c.lines?.side, !c.lines)} wide={c.scope === 'branch' && !!round?.from} editable={editable} onEdit={() => editNote(c)} onDelete={() => void actions.deleteComment(path, c.id)} />
  }
  const reviewed = !!round?.reviewed.includes(file)
  const verb = unstage ? 'Tirar' : 'Preparar'
  const g = GLYPH[target.file.status] ?? GLYPH.M!
  const slash = file.lastIndexOf('/')

  return <div className="diff-view" aria-label={`Diff de ${file}`} ref={root}>
    {find && <FindBar text={find.text} label="Buscar no diff" count={needle ? `${hits.length ? Math.min(find.at, hits.length - 1) + 1 : 0}/${hits.length}` : ''}
      disabled={!hits.length} onText={(t) => seek(t, 0)} onStep={(by) => seek(find.text, find.at + by)} onClose={() => setFind(null)} />}
    <div className="diff-head">
      <span className={`commit-status ${g.cls}`}><Icon name={g.icon} size={12} strokeWidth={2.2} /></span>
      <span className="diff-crumb" title={target.file.oldPath ? `${target.file.oldPath} → ${file}` : file}>
        <span className="muted">{file.slice(0, slash + 1)}</span><span>{file.slice(slash + 1)}</span></span>
      {wip && <span className="diff-side">{unstage ? 'Preparado' : 'Não preparado'}</span>}
      {diff && !diff.binary && <span className="mono"><span className="added">+{diff.added}</span> <span className="removed">−{diff.removed}</span></span>}
      {round && <label className="diff-reviewed" title={editable ? 'Marcar como revisado e abrir o próximo (V)' : 'Rodada concluída'}>
        <input type="checkbox" checked={reviewed} disabled={!editable} onChange={(e) => void actions.markReviewed(path, file, e.target.checked, e.target.checked)} /> Revisado</label>}
      <button className="diff-close" aria-label={round ? 'Sair da revisão e voltar ao grafo (Esc)' : 'Fechar diff e voltar ao grafo (Esc)'}
        title={round ? 'Voltar ao grafo (Esc)' : 'Fechar diff (Esc)'} onClick={() => actions.closeDiff(path)}>
        <Icon name="close" size={14} strokeWidth={2} /></button>
    </div>
    <div className="diff-tools">
      {canStage && selected.size > 0 && <>
        <button className="primary" onClick={() => stage([...selected])}>{verb} {plural(selected.size, 'linha', 'linhas')}</button>
        <button onClick={() => setSelected(new Set())}>Limpar seleção</button>
      </>}
      {editable && <button disabled={draft?.end === null && !draft.id} title="Comentário sobre o arquivo todo, sem linha"
        onClick={() => { setRange(null); setNote(''); setDraft({ id: null, end: null, side: 'new' }); scroller.current?.scrollTo({ top: 0 }) }}>Comentar arquivo</button>}
      {editable && !draft && <span className="muted">Clique ou arraste pelos números das linhas para comentar</span>}
      <span className="spacer" />
      {heads.length > 0 && <span className="muted">Trecho {Math.min(current + 1, heads.length)} de {heads.length}</span>}
      <button className="diff-nav" aria-label="Trecho anterior" title="Trecho anterior" disabled={current <= 0} onClick={() => goTo(current - 1)}>
        <Icon name="chevronUp" size={13} strokeWidth={2} /></button>
      <button className="diff-nav" aria-label="Próximo trecho" title="Próximo trecho" disabled={current >= heads.length - 1} onClick={() => goTo(current + 1)}>
        <Icon name="chevronDown" size={13} strokeWidth={2} /></button>
      <Segmented label="Layout do diff" options={LAYOUTS} value={layout} onChange={pickLayout} />
      {wip && diff && !diff.stageable && <span className="muted" title="O texto foi convertido para UTF-8; os índices de linha não batem com o arquivo">Sem stage por trecho</span>}
      {diff && <button className="diff-encoding mono muted" title="Codificação do arquivo (clique para trocar)" aria-haspopup="dialog" aria-expanded={!!encAnchor}
        onClick={(e) => setEncAnchor(e.currentTarget.getBoundingClientRect())}>{diff.encoding}{diff.guessed ? ' (adivinhada)' : ''}</button>}
    </div>
    {encAnchor && <EncodingPicker path={path} anchor={encAnchor} value={encoding} onClose={() => setEncAnchor(null)}
      onPick={(id) => setPick({ source, file, id })} />}
    {layout === 'split' && rows.length > 0 && <div className="diff-split diff-sides">
      <div>Antes <span className="mono">{source.kind === 'commit' ? 'pai' : source.kind === 'range' ? source.from.slice(0, 7) : source.kind === 'staged' ? 'HEAD' : 'index'}</span></div>
      <div>Depois <span className="mono">{source.kind === 'commit' ? source.sha.slice(0, 7) : source.kind === 'range' ? source.to.slice(0, 7) : source.kind === 'staged' ? 'index' : 'diretório'}</span></div>
    </div>}
    {!diff ? <div className="diff-message">Carregando…</div>
      : !rows.length ? <>
        <div className="diff-message">{diff.binary ? 'Arquivo binário: não há diff de texto para mostrar.' : diff.tooLarge ? 'Diff grande demais para mostrar (mais de 16 MB).'
          : diff.oldPath ? `Renomeado de ${diff.oldPath}, sem mudança de conteúdo.` : 'Sem mudanças de texto neste arquivo.'}</div>
        {round && <div className="review-file-notes">{comments.filter((c) => !c.lines).map((c) => <div key={c.id}>{noteCard(c.id)}</div>)}{draft?.end === null && composer}</div>}
      </>
            : <div className="diff-body" onMouseUp={editable ? fromSelection : undefined}>
              {textPick && <button className="review-select-comment primary" style={{ left: textPick.x, top: textPick.y }}
                onMouseDown={(e) => e.preventDefault()} onClick={() => {
                  pickLine(textPick.from, textPick.side, 'one')
                  pickLine(textPick.to, textPick.side, 'shift')
                  window.getSelection()?.removeAllRanges()
                  setTextPick(null)
                }}>Comentar {textPick.label}</button>}
              <SplitScroll virtual={virtual} scroller={scroller} split={layout === 'split'} cols={cols} hit={hit} onScroll={() => { onScroll(); if (textPick) setTextPick(null) }} measured={(i) => isNote(rows[i])}
                renderRow={(i) => {
                  const r = rows[i]!
                  if (r.type === 'comment') return noteCard(r.id)
                  if (r.type === 'composer') return composer
                  return <DiffRowView r={r} diff={diff} parts={parts} selected={round ? picked : selected} canStage={canStage} verb={verb} onToggle={toggle} onStage={stage}
                    onPick={editable ? pickLine : undefined} />
                }} />
              <div className="diff-markers" aria-hidden="true" onClick={(e) => {
                const el = scroller.current
                const box = e.currentTarget.getBoundingClientRect()
                if (el) el.scrollTop = ((e.clientY - box.top) / box.height) * el.scrollHeight - el.clientHeight / 2
              }}>
                {marks.map((m, k) => <div key={k} className={`diff-marker ${m.kind}`} style={{ top: `${m.top * 100}%`, height: `max(3px, ${m.height * 100}%)` }} />)}
              </div>
            </div>}
  </div>
}

const NO_COMMENTS: ReviewComment[] = []
const isNote = (r: DiffRow | undefined) => r?.type === 'comment' || r?.type === 'composer'
const noteId = () => `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
/** `start`: começa a arrastar; `extend`: o arrasto passou por outra linha; `shift`: estende e abre; `one`: só esta linha (teclado). */
type Pick = 'start' | 'extend' | 'shift' | 'one'

/** Comentário da Revisão logo abaixo da linha. `half`: no lado a lado, a metade do lado comentado. */
function NoteCard({ c, half, wide, editable, onEdit, onDelete }: { c: ReviewComment; half: string; wide: boolean; editable: boolean; onEdit: () => void; onDelete: () => void }) {
  return <div className={`review-note ${half}`}>
    <div className="review-note-head">
      <span>{lineLabel(c.lines)}</span>{wide && <span className="muted" title="Feito no diff da branch inteira">branch inteira</span>}
      <span className="spacer" />
      {editable && <><button onClick={onEdit}>Editar</button><button onClick={onDelete}>Excluir</button></>}
    </div>
    <div className="review-note-body">{c.body}</div>
  </div>
}

/** Caixa de escrever o comentário. O texto mora no DiffView: sobrevive ao virtualizador tirar a linha da tela. */
function Composer({ half, label, text, editing, onText, onCancel, onSave }: { half: string; label: string; text: string; editing: boolean; onText: (t: string) => void; onCancel: () => void; onSave: () => void }) {
  return <div className={`review-note composer ${half}`}>
    <div className="review-note-head"><span>{label}</span></div>
    <textarea autoFocus aria-label={`Comentário em ${label}`} placeholder="Escreva o comentário" value={text} onChange={(e) => onText(e.target.value)}
      onKeyDown={(e) => {
        if (e.key === 'Escape') { e.preventDefault(); onCancel() }
        if (e.key === 'Enter' && (e.ctrlKey || e.metaKey) && text.trim()) { e.preventDefault(); onSave() }
      }} />
    <div className="review-note-actions">
      <span className="muted"><kbd>Ctrl Enter</kbd> salva · <kbd>Esc</kbd> cancela</span><span className="spacer" />
      <button onClick={onCancel}>Cancelar</button>
      <button className="primary" disabled={!text.trim()} onClick={onSave}>{editing ? 'Salvar' : 'Comentar'}</button>
    </div>
  </div>
}

interface RowProps {
  r: DiffRow; diff: FileDiff; parts: Part[][]; selected: Set<number>; canStage: boolean; verb: string
  onToggle: (i: number, e: MouseEvent) => void; onStage: (lines: number[]) => void
  /** Revisão: o número da linha escolhe o trecho a comentar; `side` só no lado a lado. */
  onPick?: (i: number, side: 'old' | 'new' | undefined, how: Pick) => void
}

/** Uma linha do diff. Componente à parte para o Compiler reaproveitar as linhas que já estavam na tela durante o scroll. */
function DiffRowView({ r, diff, parts, selected, canStage, verb, onToggle, onStage, onPick }: RowProps) {
  const code = (l: DiffLine, i: number) => <Code parts={parts[i] ?? []}>
    {l.noNewline && <span className="diff-eol" title="Sem quebra de linha no fim do arquivo"><Icon name="noEol" size={12} /></span>}</Code>
  const mark = (l: DiffLine) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '')
  const gutter = (i: number, nums: (number | null)[], side?: 'old' | 'new') => {
    const l = diff.lines[i]!
    const cells = <>{nums.map((n, k) => <span key={k} className="diff-num">{n ?? ''}</span>)}<span className="diff-mark">{mark(l)}</span></>
    if (onPick) return <button className="diff-gutter" aria-pressed={selected.has(i)} title="Comentar esta linha (arraste ou use Shift para pegar várias)"
      aria-label={`Comentar linha ${(side === 'old' ? l.old : side === 'new' ? l.new : l.new ?? l.old) ?? ''}`}
      onPointerDown={(e) => { if (e.button !== 0) return; e.preventDefault(); onPick(i, side, e.shiftKey ? 'shift' : 'start') }}
      onPointerEnter={(e) => { if (e.buttons === 1) onPick(i, side, 'extend') }}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onPick(i, side, e.shiftKey ? 'shift' : 'one') } }}>{cells}</button>
    if (!canStage || l.kind === 'context' || l.hunk === null) return <span className="diff-gutter">{cells}</span>
    return <button className="diff-gutter" aria-pressed={selected.has(i)} title={`Selecionar linha (Shift seleciona um intervalo) para ${verb.toLowerCase()}`}
      aria-label={`Selecionar linha ${l.new ?? l.old}`} onClick={(e) => onToggle(i, e)}>{cells}</button>
  }
  const half = (i: number | null, side: 'left' | 'right') => {
    if (i === null) return <div className={`diff-half ${side} diff-empty`} />
    const l = diff.lines[i]!
    return <div className={`diff-half ${side} ${l.kind}${selected.has(i) ? ' selected' : ''}`} data-line={i} data-side={side === 'left' ? 'old' : 'new'}>
      {gutter(i, [side === 'left' ? l.old : l.new], side === 'left' ? 'old' : 'new')}{code(l, i)}</div>
  }
  if (r.type === 'comment' || r.type === 'composer') return null
  if (r.type === 'hunk') {
    const h = diff.hunks[r.hunk]!
    return <div className="diff-hunk"><span>{h.header}</span>
      {canStage && <button onClick={() => onStage(hunkLines(diff, r.hunk))}>{verb} trecho</button>}</div>
  }
  if (r.type === 'split') return <div className="diff-split">{half(r.left, 'left')}{half(r.right, 'right')}</div>
  const l = diff.lines[r.line]!
  return <div className={`diff-line ${l.kind}${selected.has(r.line) ? ' selected' : ''}`} data-line={r.line}>{gutter(r.line, [l.old, l.new])}{code(l, r.line)}</div>
}
