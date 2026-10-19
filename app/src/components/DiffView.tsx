import { useVirtualizer } from '@tanstack/react-virtual'
import { EncodingPicker } from './EncodingPicker'
import { Icon, type IconName } from './Icon'
import { selectSide } from './selectSide'
import { Segmented } from './Segmented'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { core } from '../bridge'
import type { DiffLine, DiffSource, FileDiff } from '../bridge/types'
import { actions, isActiveTab, selectDiff, selectWipRevision, useApp } from '../store/app'
import type { Rect } from './menuModel'
import { diffParts, type Part } from './syntax'
import { diffRows, hunkLines, hunkRows, LAYOUTS, markers, selectionArgs, type DiffLayout, type DiffRow } from './diffModel'

const LINE = 20
const HUNK = 28
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
  const anchor = useRef<number | null>(null)
  const loaded = useRef<{ diff: FileDiff; source: DiffSource; layout: DiffLayout } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const source = target?.source
  const file = target?.file.path ?? ''
  const encoding = pick && pick.source === source && pick.file === file ? pick.id : 'guess'
  const wip = source !== undefined && source.kind !== 'commit'
  const canStage = wip && (diff?.stageable ?? true)
  const unstage = source?.kind === 'staged'

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
    }, (err) => { if (active) actions.reportError(err) })
    return () => { active = false }
  }, [path, file, source, layout, encoding, wip ? revision : 0])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (!isActiveTab(path) || e.key !== 'Escape' || e.defaultPrevented || typing || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      actions.closeDiff(path)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = diff && !diff.binary && !diff.tooLarge ? diffRows(diff, layout) : []
  const heads = hunkRows(rows)
  const parts = rows.length ? diffParts(diff!) : []
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, overscan: 20,
    estimateSize: (i) => (rows[i]?.type === 'hunk' ? HUNK : LINE), getItemKey: (i) => rows[i]!.key })
  if (!target || !source) return null

  const pickLayout = (next: DiffLayout) => { setLayout(next); try { localStorage.setItem(LAYOUT_KEY, next) } catch { /* sem storage */ } }
  const goTo = (n: number) => { if (heads[n] !== undefined) virtual.scrollToIndex(heads[n]!, { align: 'start' }); setCurrent(n) }
  const onScroll = () => {
    const at = virtual.getVirtualItemForOffset(scroller.current?.scrollTop ?? 0)?.index ?? 0
    setCurrent(Math.max(0, heads.filter((h) => h <= at + 1).length - 1))
  }
  const stage = (lines: number[]) => {
    if (!diff) return
    void core.stageLines(path, file, unstage, selectionArgs(diff, new Set(lines))).then(() => {
      setSelected(new Set()); actions.wipChanged(path)
    }, actions.reportError)
  }
  const toggle = (i: number, e: MouseEvent) => {
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
  }
  const verb = unstage ? 'Tirar' : 'Preparar'
  const g = GLYPH[target.file.status] ?? GLYPH.M!
  const slash = file.lastIndexOf('/')

  const code = (l: DiffLine, i: number) => <span className="diff-code">{(parts[i] ?? ([] as Part[])).map((p, k) => <span key={k} className={`syn-${p.c}`}>{p.t}</span>)}
    {l.noNewline && <span className="diff-eol" title="Sem quebra de linha no fim do arquivo"><Icon name="noEol" size={12} /></span>}</span>
  const mark = (l: DiffLine) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '')
  const gutter = (i: number, nums: (number | null)[]) => {
    const l = diff!.lines[i]!
    const cells = <>{nums.map((n, k) => <span key={k} className="diff-num">{n ?? ''}</span>)}<span className="diff-mark">{mark(l)}</span></>
    if (!canStage || l.kind === 'context' || l.hunk === null) return <span className="diff-gutter">{cells}</span>
    return <button className="diff-gutter" aria-pressed={selected.has(i)} title={`Selecionar linha (Shift seleciona um intervalo) para ${verb.toLowerCase()}`}
      aria-label={`Selecionar linha ${l.new ?? l.old}`} onClick={(e) => toggle(i, e)}>{cells}</button>
  }
  const half = (i: number | null, side: 'left' | 'right') => {
    if (i === null) return <div className={`diff-half ${side} diff-empty`} />
    const l = diff!.lines[i]!
    return <div className={`diff-half ${side} ${l.kind}${selected.has(i) ? ' selected' : ''}`}>{gutter(i, [side === 'left' ? l.old : l.new])}{code(l, i)}</div>
  }
  const row = (r: DiffRow) => {
    if (r.type === 'hunk') {
      const h = diff!.hunks[r.hunk]!
      return <div className="diff-hunk"><span>{h.header}</span>
        {canStage && <button onClick={() => stage(hunkLines(diff!, r.hunk))}>{verb} trecho</button>}</div>
    }
    if (r.type === 'split') return <div className="diff-split">{half(r.left, 'left')}{half(r.right, 'right')}</div>
    const l = diff!.lines[r.line]!
    return <div className={`diff-line ${l.kind}${selected.has(r.line) ? ' selected' : ''}`}>{gutter(r.line, [l.old, l.new])}{code(l, r.line)}</div>
  }

  return <div className="diff-view" aria-label={`Diff de ${file}`}>
    <div className="diff-head">
      <span className={`commit-status ${g.cls}`}><Icon name={g.icon} size={12} strokeWidth={2.2} /></span>
      <span className="diff-crumb" title={target.file.oldPath ? `${target.file.oldPath} → ${file}` : file}>
        <span className="muted">{file.slice(0, slash + 1)}</span><span>{file.slice(slash + 1)}</span></span>
      {wip && <span className="diff-side">{unstage ? 'Preparado' : 'Não preparado'}</span>}
      {diff && !diff.binary && <span className="mono"><span className="added">+{diff.added}</span> <span className="removed">−{diff.removed}</span></span>}
      <button className="diff-close" aria-label="Fechar diff e voltar ao grafo (Esc)" title="Fechar diff (Esc)" onClick={() => actions.closeDiff(path)}>
        <Icon name="close" size={14} strokeWidth={2} /></button>
    </div>
    <div className="diff-tools">
      {canStage && selected.size > 0 && <>
        <button className="primary" onClick={() => stage([...selected])}>{verb} {plural(selected.size, 'linha', 'linhas')}</button>
        <button onClick={() => setSelected(new Set())}>Limpar seleção</button>
      </>}
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
      <div>Antes <span className="mono">{source.kind === 'commit' ? 'pai' : source.kind === 'staged' ? 'HEAD' : 'index'}</span></div>
      <div>Depois <span className="mono">{source.kind === 'commit' ? source.sha.slice(0, 7) : source.kind === 'staged' ? 'index' : 'diretório'}</span></div>
    </div>}
    {!diff ? <div className="diff-message">Carregando…</div>
      : diff.binary ? <div className="diff-message">Arquivo binário: não há diff de texto para mostrar.</div>
        : diff.tooLarge ? <div className="diff-message">Diff grande demais para mostrar (mais de 16 MB).</div>
          : !rows.length ? <div className="diff-message">{diff.oldPath ? `Renomeado de ${diff.oldPath}, sem mudança de conteúdo.` : 'Sem mudanças de texto neste arquivo.'}</div>
            : <div className="diff-body">
              <div className={`diff-scroll ${layout}`} ref={scroller} onScroll={onScroll} onPointerDown={selectSide}>
                <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
                  {virtual.getVirtualItems().map((item) => <div key={item.key} className="diff-row" style={{ transform: `translateY(${item.start}px)`, height: item.size }}>
                    {row(rows[item.index]!)}</div>)}
                </div>
              </div>
              <div className="diff-markers" aria-hidden="true" onClick={(e) => {
                const el = scroller.current
                const box = e.currentTarget.getBoundingClientRect()
                if (el) el.scrollTop = ((e.clientY - box.top) / box.height) * el.scrollHeight - el.clientHeight / 2
              }}>
                {markers(diff, rows).map((m, k) => <div key={k} className={`diff-marker ${m.kind}`} style={{ top: `${m.top * 100}%`, height: `max(3px, ${m.height * 100}%)` }} />)}
              </div>
            </div>}
  </div>
}
