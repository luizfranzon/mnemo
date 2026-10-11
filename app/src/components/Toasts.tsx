import { actions, dismissToast, useApp } from '../store/app'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className="toast" key={t.id}>
          <span>{t.text}</span>
          {t.undoPath && (
            <button
              onClick={() => {
                dismissToast(t.id)
                void actions.undo(t.undoPath!)
              }}
            >
              Desfazer
            </button>
          )}
          {t.pullPath && <button onClick={() => { dismissToast(t.id); void actions.pullNow(t.pullPath!) }}>Pull agora</button>}
        </div>
      ))}
    </div>
  )
}
