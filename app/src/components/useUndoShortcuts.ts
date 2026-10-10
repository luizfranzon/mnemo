import { useEffect } from 'react'
import { core } from '../bridge'
import { actions, selectActiveTab, useApp } from '../store/app'

const isTextField = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || el instanceof HTMLTextAreaElement || (el instanceof HTMLInputElement && el.type !== 'checkbox' && el.type !== 'button'))

/**
 * `Ctrl+Z`/`Ctrl+Y` em campo de texto ficam com o desfazer nativo do texto. Fora do campo agem na
 * Operação. O menu Editar recebe o foco para mostrar "Desfazer digitação" + "Desfazer checkout".
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
    const onFocus = () => void pushMenuState()
    window.addEventListener('keydown', onKey)
    window.addEventListener('focusin', onFocus)
    window.addEventListener('focusout', onFocus)
    const unsubscribe = useApp.subscribe(() => void pushMenuState())
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('focusin', onFocus)
      window.removeEventListener('focusout', onFocus)
      unsubscribe()
    }
  }, [])
}

let last = ''
async function pushMenuState() {
  const tab = selectActiveTab(useApp.getState())
  const state = {
    undoLabel: tab?.undo.undo.enabled ? tab.undo.undo.label : null,
    undoReason: tab?.undo.undo.reason ?? 'sem repositório',
    redoLabel: tab?.undo.redo.enabled ? tab.undo.redo.label : null,
    redoReason: tab?.undo.redo.reason ?? 'sem repositório',
    textFocus: isTextField(document.activeElement),
    hasRepo: tab !== undefined,
  }
  const json = JSON.stringify(state)
  if (json === last) return // o menu nativo só é reconstruído quando algo muda
  last = json
  await core.setMenuState(state).catch(() => undefined)
}
