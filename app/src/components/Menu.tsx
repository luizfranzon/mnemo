import { useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent } from 'react'
import { placeMenu, type MenuEntry, type Rect } from './menuModel'
import { Icon } from './Icon'

interface ListProps {
  items: MenuEntry[]
  anchor: Rect
  side: 'below' | 'right'
  label: string
  /** Fecha a árvore inteira e devolve o foco a quem tinha antes. */
  close: () => void
  /** Submenu: `←` volta ao pai. */
  back?: () => void
  /** Aberto pelo teclado: já começa no primeiro item. */
  keyboard?: boolean
}

/**
 * Componente de menu único (docs/02-comportamentos.md § Menus de contexto). Um overlay transparente cobre a
 * janela: clique fora só fecha (não chega ao que está embaixo) e a roda não rola os painéis enquanto aberto.
 * `anchor` é o botão do menu da janela ou um retângulo de tamanho zero no ponto do clique direito.
 */
export function Menu({ items, anchor, label, onClose }: { items: MenuEntry[]; anchor: Rect; label: string; onClose: () => void }) {
  // capturado antes de o menu pegar o foco: "Desfazer digitação" precisa do campo focado de volta
  const [previous] = useState(() => document.activeElement)
  const close = () => {
    if (previous instanceof HTMLElement) previous.focus()
    onClose()
  }
  const dismiss = (e: { preventDefault(): void }) => {
    e.preventDefault()
    close()
  }
  return (
    <div className="menu-overlay" onMouseDown={dismiss} onContextMenu={dismiss}>
      <MenuList items={items} anchor={anchor} side="below" label={label} close={close} />
    </div>
  )
}

const first = (items: MenuEntry[]) => items.findIndex((i) => i !== '-' && !i.heading)

function MenuList({ items, anchor, side, label, close, back, keyboard }: ListProps) {
  const ref = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(() => (keyboard ? first(items) : -1))
  const [sub, setSub] = useState<{ index: number; anchor: Rect; keyboard: boolean } | null>(null)

  useLayoutEffect(() => {
    const el = ref.current!
    const { left, top } = placeMenu(anchor, el.offsetWidth, el.offsetHeight, side, innerWidth, innerHeight)
    el.style.left = `${left}px`
    el.style.top = `${top}px`
    el.focus()
  }, [anchor, side])

  useEffect(() => {
    ref.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' })
  }, [active])

  const node = (i: number) => ref.current?.querySelector(`[data-index="${i}"]`)
  const openSub = (i: number, byKeyboard: boolean) => {
    const it = items[i]
    if (!it || it === '-' || !it.submenu || it.reason) return setSub(null)
    if (sub?.index === i && !byKeyboard) return
    setSub({ index: i, anchor: node(i)!.getBoundingClientRect(), keyboard: byKeyboard })
  }
  const closeSub = () => {
    setSub(null)
    ref.current?.focus()
  }
  const activate = (i: number) => {
    const it = items[i]
    if (!it || it === '-' || it.heading || it.reason) return
    if (it.submenu) return openSub(i, true)
    close()
    it.run?.()
  }
  const step = (dir: 1 | -1) => {
    let i = active
    for (let n = 0; n < items.length; n++) {
      i = (i + dir + items.length) % items.length
      const item = items[i]
      if (item && item !== '-' && !item.heading) return setActive(i)
    }
  }

  const onKeyDown = (e: KeyboardEvent) => {
    e.stopPropagation() // aberto, o menu é dono do teclado: nenhum atalho da janela dispara
    if (e.key === 'ArrowDown') step(1)
    else if (e.key === 'ArrowUp') step(-1)
    else if (e.key === 'ArrowRight') openSub(active, true)
    else if (e.key === 'ArrowLeft') back?.()
    else if (e.key === 'Escape') close()
    else if (e.key === 'Enter' || e.key === ' ') activate(active)
    else if (e.key !== 'Tab') return
    e.preventDefault()
  }

  const subItem = sub && items[sub.index]
  return (
    <>
      <div ref={ref} className="menu" role="menu" aria-label={label} tabIndex={-1} onKeyDown={onKeyDown} onMouseDown={(e) => {
        e.stopPropagation()
        e.preventDefault() // o foco fica no menu (o teclado continua valendo)
      }}>
        {items.map((it, i) =>
          it === '-' ? (
            <div key={`-${i}`} className="menu-sep" role="separator" />
          ) : it.heading ? (
            <div key={`heading:${it.label}`} className="toolbar-menu-heading" role="presentation">{it.label}</div>
          ) : (
            <button
              /* lista fixa enquanto aberta; rótulos podem repetir (Abas de mesmo nome) */
              key={`${i}:${it.label}`}
              type="button"
              role={it.checked === undefined ? 'menuitem' : 'menuitemradio'}
              aria-checked={it.checked}
              tabIndex={-1}
              data-index={i}
              className={`menu-item${i === active ? ' active' : ''}${it.danger ? ' danger' : ''}${it.warn ? ' warn' : ''}`}
              aria-disabled={it.reason ? true : undefined}
              aria-haspopup={it.submenu ? 'menu' : undefined}
              aria-expanded={it.submenu ? sub?.index === i : undefined}
              title={it.reason}
              onMouseEnter={() => {
                setActive(i)
                if (it.submenu) openSub(i, false)
                else if (sub) closeSub()
              }}
              onClick={() => activate(i)}
            >
              {it.checked !== undefined && <span className="radio-mark" aria-hidden="true"><Icon name={it.checked ? 'radioOn' : 'radioOff'} size={12} strokeWidth={2} /></span>}
              <span className="menu-label">{it.label}</span>
              {it.shortcut && <span className="menu-hint">{it.shortcut}</span>}
              {it.submenu && (
                <Icon name="chevron" size={14} strokeWidth={2} />
              )}
            </button>
          ),
        )}
      </div>
      {sub && subItem && subItem !== '-' && subItem.submenu && (
        <MenuList key={`${sub.index}:${sub.keyboard}`} items={subItem.submenu} anchor={sub.anchor} side="right" label={subItem.label} close={close} back={closeSub} keyboard={sub.keyboard} />
      )}
    </>
  )
}
