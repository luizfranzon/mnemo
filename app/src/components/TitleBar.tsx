import { useEffect, useState } from 'react'
import { core } from '../bridge'
import { selectActiveTab, useApp } from '../store/app'
import { Menu } from './Menu'
import { matchesShortcut, type MenuEntry, type Rect } from './menuModel'
import { isTextField } from './useUndoShortcuts'
import { menuContext, windowMenus } from './windowMenus'

const MENUS = ['Arquivo', 'Editar', 'Exibir', 'Repositório', 'Ajuda']

/** Barra de título (TopBar.dc.html): janela sem moldura; arrasta pela barra e o duplo clique maximiza (nativo). */
export function TitleBar() {
  const name = useApp((s) => selectActiveTab(s)?.name)
  const [open, setOpen] = useState<{ label: string; anchor: Rect; items: MenuEntry[] } | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.repeat) return // segurar Ctrl+W não fecha várias Abas
      for (const menu of windowMenus(menuContext(false))) {
        if (menu.label === 'Editar') continue // Ctrl+Z/Y: useUndoShortcuts; recortar/colar/selecionar: o Chromium
        for (const it of flatten(menu.items)) {
          // item desabilitado não engole a tecla (Ctrl+Enter, Alt+T… seguem para o campo focado)
          if (!it.shortcut || it.reason || !matchesShortcut(it.shortcut, e)) continue
          e.preventDefault()
          it.run?.()
          return
        }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const toggle = (label: string, button: HTMLElement) => {
    if (open?.label === label) return setOpen(null)
    // retrato da store na hora de abrir: o foco ainda está no campo (o botão não rouba foco no mousedown)
    const items = windowMenus(menuContext(isTextField(document.activeElement))).find((m) => m.label === label)!.items
    setOpen({ label, anchor: button.getBoundingClientRect(), items })
  }

  return (
    <header className="titlebar">
      <div className="titlebar-brand">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <circle cx="6" cy="6" r="2.5" />
          <circle cx="6" cy="18" r="2.5" />
          <circle cx="18" cy="12" r="2.5" />
          <path d="M6 8.5v7M8.3 7.2l7.4 3.6M8.3 16.8l7.4-3.6" />
        </svg>
        <span>Mnemo</span>
      </div>
      <nav className="titlebar-menus" aria-label="Menus da janela">
        {MENUS.map((label) => (
          <button
            key={label}
            type="button"
            className={open?.label === label ? 'titlebar-menu open' : 'titlebar-menu'}
            aria-haspopup="menu"
            aria-expanded={open?.label === label}
            onMouseDown={(e) => {
              if (e.button !== 0) return
              e.preventDefault()
              toggle(label, e.currentTarget)
            }}
            /* `detail` 0: veio do teclado (Enter/Espaço); o mouse já abriu no mousedown */
            onClick={(e) => e.detail === 0 && toggle(label, e.currentTarget)}
          >
            {label}
          </button>
        ))}
      </nav>
      <div className="titlebar-title">{name ? `${name} — Mnemo` : 'Mnemo'}</div>
      <button type="button" className="window-control" aria-label="Minimizar" onClick={() => void core.window('minimize')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 12h12" />
        </svg>
      </button>
      <button type="button" className="window-control" aria-label="Maximizar" onClick={() => void core.window('toggleMaximize')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true">
          <rect x="5" y="5" width="14" height="14" rx="1.5" />
        </svg>
      </button>
      <button type="button" className="window-control close" aria-label="Fechar janela" onClick={() => void core.window('close')}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
      {open && <Menu items={open.items} anchor={open.anchor} label={open.label} onClose={() => setOpen(null)} />}
    </header>
  )
}

const flatten = (items: MenuEntry[]): Exclude<MenuEntry, '-'>[] => items.flatMap((i) => (i === '-' ? [] : [i, ...flatten(i.submenu ?? [])]))
