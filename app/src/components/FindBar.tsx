import { useEffect, useRef, type RefObject } from 'react'
import { Icon } from './Icon'
import { isActiveTab } from '../store/app'
import { matchesShortcut } from './menuModel'

interface Props {
  text: string; label: string; count: string; disabled: boolean
  onText: (text: string) => void; onStep: (by: 1 | -1) => void; onClose: () => void
}

/** Caixa de busca flutuante (grafo, diff, conflito): Enter/Shift+Enter navegam, Esc fecha. */
export function FindBar({ text, label, count, disabled, onText, onStep, onClose }: Props) {
  return <div className="graph-filter" role="search" onKeyDown={(e) => {
    if (e.key === 'Escape') onClose()
    else if (e.key === 'Enter' || e.key === 'ArrowDown' || e.key === 'ArrowUp') { e.preventDefault(); onStep(e.key === 'ArrowUp' || e.shiftKey ? -1 : 1) }
  }}>
    <input value={text} onChange={(e) => onText(e.target.value)} placeholder={`${label}…`} aria-label={label} />
    <span className="graph-filter-count" aria-live="polite">{count}</span>
    <button className="up" aria-label="Ocorrência anterior" title="Anterior (Shift+Enter)" disabled={disabled} onClick={() => onStep(-1)}><Icon name="chevron" size={14} /></button>
    <button className="down" aria-label="Próxima ocorrência" title="Próxima (Enter)" disabled={disabled} onClick={() => onStep(1)}><Icon name="chevron" size={14} /></button>
    <button aria-label="Fechar busca" onClick={onClose}><Icon name="close" size={14} /></button>
  </div>
}

/** Ctrl+F na aba ativa chama `open`. Com a busca aberta, `open` só devolve o foco e seleciona o texto, como no navegador. */
export function useFindShortcut(path: string, open: () => void, skip: () => boolean = () => false) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!isActiveTab(path) || e.defaultPrevented || !matchesShortcut('Ctrl+F', e) || skip()) return
      e.preventDefault()
      open()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}

/** Foca e seleciona o campo da busca dentro de `root` no próximo frame (logo depois de montar). */
export const focusFind = (root: RefObject<HTMLElement | null>) =>
  requestAnimationFrame(() => root.current?.querySelector<HTMLInputElement>('.graph-filter input')?.select())

const NAME = 'find'

/**
 * Marca as ocorrências de `needle` nas linhas visíveis de `root` (`.diff-code`) via CSS Custom Highlight, sem tocar no DOM.
 * Roda a cada render: a lista é virtualizada e as linhas da tela mudam com o scroll.
 */
export function useFindHighlight(root: RefObject<HTMLElement | null>, needle: string) {
  const mine = useRef<Range[]>([])
  useEffect(() => {
    if (typeof Highlight === 'undefined') return
    const hl = CSS.highlights.get(NAME) ?? new Highlight()
    CSS.highlights.set(NAME, hl)
    for (const r of mine.current) hl.delete(r)
    mine.current = needle && root.current ? rangesOf(root.current, needle) : []
    for (const r of mine.current) hl.add(r)
  })
  useEffect(() => () => { for (const r of mine.current) CSS.highlights?.get(NAME)?.delete(r) }, [])
}

function rangesOf(root: HTMLElement, needle: string): Range[] {
  const out: Range[] = []
  for (const code of root.querySelectorAll('.diff-code')) {
    // o texto da linha vem quebrado em spans de sintaxe: busca no texto inteiro e mapeia de volta para os nós
    const nodes: Text[] = []
    const walk = document.createTreeWalker(code, NodeFilter.SHOW_TEXT)
    for (let n = walk.nextNode(); n; n = walk.nextNode()) nodes.push(n as Text)
    const text = nodes.map((n) => n.data).join('').toLocaleLowerCase()
    const at = (offset: number): [Text, number] => {
      let k = 0
      while (k < nodes.length - 1 && offset > nodes[k]!.data.length) offset -= nodes[k++]!.data.length
      // toLocaleLowerCase pode mudar o tamanho (İ): nunca passa do fim do nó
      return [nodes[k]!, Math.min(offset, nodes[k]!.data.length)]
    }
    for (let i = text.indexOf(needle); i >= 0; i = text.indexOf(needle, i + needle.length)) {
      const r = new Range()
      r.setStart(...at(i))
      r.setEnd(...at(i + needle.length))
      out.push(r)
    }
  }
  return out
}
