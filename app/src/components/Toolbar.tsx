import { actions, runningLabel, selectActiveTab, useApp } from '../store/app'

/** Desfazer/Refazer agem sempre na Operação, mesmo com foco em campo de texto. */
export function Toolbar() {
  const path = useApp((s) => selectActiveTab(s)?.path)
  const head = useApp((s) => selectActiveTab(s)?.head)
  const undo = useApp((s) => selectActiveTab(s)?.undo.undo)
  const redo = useApp((s) => selectActiveTab(s)?.undo.redo)
  const running = useApp((s) => (path ? runningLabel(s, path) : undefined))
  if (!path || !undo || !redo) return null
  const busyReason = running ? `${running} Aguarde terminar.` : undefined
  return (
    <div className="toolbar">
      {head?.kind === 'detached' && <span className="badge warning">HEAD destacado · Criar branch aqui</span>}
      <button
        disabled={!undo.enabled || !!running}
        title={busyReason ?? (undo.enabled ? `${undo.label} (Ctrl+Z)` : (undo.reason ?? ''))}
        onClick={() => void actions.undo(path)}
      >
        ↶ Desfazer
      </button>
      <button
        disabled={!redo.enabled || !!running}
        title={busyReason ?? (redo.enabled ? `${redo.label} (Ctrl+Y)` : (redo.reason ?? ''))}
        onClick={() => void actions.redo(path)}
      >
        ↷ Refazer
      </button>
      <button onClick={() => actions.setPalette(true)} disabled={!!running} title={busyReason ?? 'Checkout de branch (Ctrl+P)'}>
        Checkout…
      </button>
      {running && <span className="badge">{running}</span>}
    </div>
  )
}
