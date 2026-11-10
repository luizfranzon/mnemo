import type { Virtualizer } from '@tanstack/react-virtual'
import type { CSSProperties, PointerEvent, ReactNode, RefObject, UIEvent } from 'react'
import { selectSide } from './selectSide'
import type { Part } from './syntax'

/** Código colorido de uma linha. `.diff-text` é o que desliza com a barra horizontal do lado a lado. */
export function Code({ parts, children }: { parts: Part[]; children?: ReactNode }) {
  return <span className="diff-code"><span className="diff-text">{parts.map((p, k) => <span key={k} className={`syn-${p.c}`}>{p.t}</span>)}{children}</span></span>
}

interface Props {
  virtual: Virtualizer<HTMLDivElement, Element>
  scroller: RefObject<HTMLDivElement | null>
  /** Layout lado a lado: as duas metades rolam juntas pelas barras horizontais. */
  split: boolean
  /** Coluna da linha mais longa (fonte mono), que dá a largura das barras horizontais. */
  cols: number
  /** Largura em px da calha + números + botões de uma metade. */
  gutter?: number
  hit?: number
  onScroll?: () => void
  /** Linha de altura livre (comentário da Revisão): o virtualizador mede depois de desenhar. */
  measured?: (index: number) => boolean
  renderRow: (index: number) => ReactNode
}

/** Corpo virtualizado compartilhado por diff e conflito: linhas, destaque da busca e rolagem horizontal das metades. */
export function SplitScroll({ virtual, scroller, split, cols, gutter = 76, hit, onScroll, measured, renderRow }: Props) {
  // as duas barras horizontais andam juntas; o deslocamento vai por CSS variable, sem re-render
  const syncX = (e: UIEvent<HTMLDivElement>) => {
    const x = (e.target as HTMLElement).scrollLeft
    for (const bar of e.currentTarget.parentElement!.children) (bar as HTMLElement).scrollLeft = x
    scroller.current?.style.setProperty('--sx', `${x}px`)
  }
  return <div className="diff-main" style={{ '--cols': cols, '--gutter': `${gutter}px` } as CSSProperties}>
    <div className={`diff-scroll ${split ? 'split' : 'unified'}`} ref={scroller} onScroll={onScroll} onPointerDown={(e: PointerEvent<HTMLDivElement>) => selectSide(e)}>
      <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => measured?.(item.index)
          ? <div key={item.key} data-index={item.index} ref={virtual.measureElement} className="diff-row diff-row-free" style={{ transform: `translateY(${item.start}px)` }}>
            {renderRow(item.index)}</div>
          : <div key={item.key} className={item.index === hit ? 'diff-row find-current' : 'diff-row'} style={{ transform: `translateY(${item.start}px)`, height: item.size }}>
            {renderRow(item.index)}</div>)}
      </div>
    </div>
    {split && <div className="diff-hbars">
      <div className="diff-hbar" onScroll={syncX}><div /></div><div className="diff-hbar" onScroll={syncX}><div /></div></div>}
  </div>
}
