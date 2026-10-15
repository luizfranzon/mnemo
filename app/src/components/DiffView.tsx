import { useVirtualizer } from '@tanstack/react-virtual'
import { Segmented } from './Segmented'
import { useEffect, useRef, useState, type MouseEvent } from 'react'
import { core } from '../bridge'
import type { DiffLine, DiffSource, FileDiff } from '../bridge/types'
import { actions, selectDiff, selectWipRevision, useApp } from '../store/app'
import { diffRows, display, highlight, hunkLines, hunkRows, LAYOUTS, markers, selectionArgs, type DiffLayout, type DiffRow } from './diffModel'

const LINE = 20
const HUNK = 28
const LAYOUT_KEY = 'mnemo.diff.layout'
const GLYPH: Record<string, { icon: string; cls: string }> = {
  A: { icon: '+', cls: 'added' }, M: { icon: '✎', cls: 'modified' }, T: { icon: '✎', cls: 'modified' }, U: { icon: '·', cls: 'plain' },
  D: { icon: '−', cls: 'removed' }, R: { icon: '→', cls: 'renamed' }, C: { icon: '⧉', cls: 'renamed' },
}
const loadLayout = (): DiffLayout => {
  try { const l = localStorage.getItem(LAYOUT_KEY); return l === 'inline' || l === 'split' ? l : 'hunks' } catch { return 'hunks' }
}
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

/** Diff de um arquivo no centro (Diff.dc.html). No WIP, prepara/tira trecho ou linhas escolhidas. */
export function DiffView({ path }: { path: string }) {
  const target = useApp(selectDiff(path))
  const revision = useApp(selectWipRevision(path))
  const [layout, setLayout] = useState(loadLayout)
  const [diff, setDiff] = useState<FileDiff | null>(null)
  const [selected, setSelected] = useState<Set<number>>(new Set())
  const [current, setCurrent] = useState(0)
  const anchor = useRef<number | null>(null)
  const loaded = useRef<{ diff: FileDiff; source: DiffSource; layout: DiffLayout } | null>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const source = target?.source
  const file = target?.file.path ?? ''
  const wip = source !== undefined && source.kind !== 'commit'
  const unstage = source?.kind === 'staged'

  useEffect(() => {
    if (!source) return
    let active = true
    void core.fileDiff(path, file, source, layout !== 'hunks').then((next) => {
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
  }, [path, file, source, layout, wip ? revision : 0])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement
      if (e.key !== 'Escape' || e.defaultPrevented || typing || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      actions.closeDiff()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const rows = diff && !diff.binary && !diff.tooLarge ? diffRows(diff, layout) : []
  const heads = hunkRows(rows)
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

  const code = (l: DiffLine) => <span className="diff-code">{highlight(display(l)).map((p, k) => <span key={k} className={`syn-${p.c}`}>{p.t}</span>)}
    {l.noNewline && <span className="diff-eol" title="Sem quebra de linha no fim do arquivo">⏎̸</span>}</span>
  const mark = (l: DiffLine) => (l.kind === 'add' ? '+' : l.kind === 'del' ? '−' : '')
  const gutter = (i: number, nums: (number | null)[]) => {
    const l = diff!.lines[i]!
    const cells = <>{nums.map((n, k) => <span key={k} className="diff-num">{n ?? ''}</span>)}<span className="diff-mark">{mark(l)}</span></>
    if (!wip || l.kind === 'context' || l.hunk === null) return <span className="diff-gutter">{cells}</span>
    return <button className="diff-gutter" aria-pressed={selected.has(i)} title={`Selecionar linha (Shift seleciona um intervalo) para ${verb.toLowerCase()}`}
      aria-label={`Selecionar linha ${l.new ?? l.old}`} onClick={(e) => toggle(i, e)}>{cells}</button>
  }
  const half = (i: number | null, side: 'left' | 'right') => {
    if (i === null) return <div className={`diff-half ${side} diff-empty`} />
    const l = diff!.lines[i]!
    return <div className={`diff-half ${side} ${l.kind}${selected.has(i) ? ' selected' : ''}`}>{gutter(i, [side === 'left' ? l.old : l.new])}{code(l)}</div>
  }
  const row = (r: DiffRow) => {
    if (r.type === 'hunk') {
      const h = diff!.hunks[r.hunk]!
      return <div className="diff-hunk"><span>{h.header}</span>
        {wip && <button onClick={() => stage(hunkLines(diff!, r.hunk))}>{verb} trecho</button>}</div>
    }
    if (r.type === 'split') return <div className="diff-split">{half(r.left, 'left')}{half(r.right, 'right')}</div>
    const l = diff!.lines[r.line]!
    return <div className={`diff-line ${l.kind}${selected.has(r.line) ? ' selected' : ''}`}>{gutter(r.line, [l.old, l.new])}{code(l)}</div>
  }

  return <div className="diff-view" aria-label={`Diff de ${file}`}>
    <div className="diff-head">
      <span className={`commit-status ${g.cls}`}>{g.icon}</span>
      <span className="diff-crumb" title={target.file.oldPath ? `${target.file.oldPath} → ${file}` : file}>
        <span className="muted">{file.slice(0, slash + 1)}</span><span>{file.slice(slash + 1)}</span></span>
      {wip && <span className="diff-side">{unstage ? 'Preparado' : 'Não preparado'}</span>}
      {diff && !diff.binary && <span className="mono"><span className="added">+{diff.added}</span> <span className="removed">−{diff.removed}</span></span>}
      <button className="diff-close" aria-label="Fechar diff e voltar ao grafo (Esc)" title="Fechar diff (Esc)" onClick={actions.closeDiff}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg></button>
    </div>
    <div className="diff-tools">
      {wip && selected.size > 0 && <>
        <button className="primary" onClick={() => stage([...selected])}>{verb} {plural(selected.size, 'linha', 'linhas')}</button>
        <button onClick={() => setSelected(new Set())}>Limpar seleção</button>
      </>}
      <span className="spacer" />
      {heads.length > 0 && <span className="muted">Trecho {Math.min(current + 1, heads.length)} de {heads.length}</span>}
      <button className="diff-nav" aria-label="Trecho anterior" title="Trecho anterior" disabled={current <= 0} onClick={() => goTo(current - 1)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 15l6-6 6 6" /></svg></button>
      <button className="diff-nav" aria-label="Próximo trecho" title="Próximo trecho" disabled={current >= heads.length - 1} onClick={() => goTo(current + 1)}>
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><path d="M6 9l6 6 6-6" /></svg></button>
      <Segmented label="Layout do diff" options={LAYOUTS} value={layout} onChange={pickLayout} />
      {diff && <span className="mono muted" title="Codificação do arquivo">{diff.encoding}</span>}
    </div>
    {layout === 'split' && rows.length > 0 && <div className="diff-split diff-sides">
      <div>Antes <span className="mono">{source.kind === 'commit' ? 'pai' : source.kind === 'staged' ? 'HEAD' : 'index'}</span></div>
      <div>Depois <span className="mono">{source.kind === 'commit' ? source.sha.slice(0, 7) : source.kind === 'staged' ? 'index' : 'diretório'}</span></div>
    </div>}
    {!diff ? <div className="diff-message">Carregando…</div>
      : diff.binary ? <div className="diff-message">Arquivo binário: não há diff de texto para mostrar.</div>
        : diff.tooLarge ? <div className="diff-message">Diff grande demais para mostrar (mais de 16 MB).</div>
          : !rows.length ? <div className="diff-message">{diff.oldPath ? `Renomeado de ${diff.oldPath}, sem mudança de conteúdo.` : 'Sem mudanças de texto neste arquivo.'}</div>
            : <div className="diff-body">
              <div className={`diff-scroll ${layout}`} ref={scroller} onScroll={onScroll}>
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
