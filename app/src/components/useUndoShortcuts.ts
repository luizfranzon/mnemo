import { useEffect } from 'react'
import { actions, selectActiveTab, useApp } from '../store/app'

export const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'button'))

/**
 * `Ctrl+Z`/`Ctrl+Y` em campo de texto ficam com o desfazer nativo do texto. Fora do campo agem na
 * Operação. O menu Editar lê o foco ao abrir para mostrar "Desfazer digitação" + "Desfazer checkout".
 */
export function useUndoShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey) || isTextField(e.target)) return
      const key = e.key.toLowerCase()
      const tab = selectActiveTab(useApp.getState())
      if (!tab) return
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault()
        void actions.undo(tab.path)
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault()
        void actions.redo(tab.path)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
