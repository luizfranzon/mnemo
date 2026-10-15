import { actions, dismissToast, useApp } from '../store/app'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className={t.error ? 'toast error' : 'toast'} key={t.id} role={t.error ? 'alert' : undefined}>
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
          {t.retry && <button onClick={() => { dismissToast(t.id); void t.retry!() }}>Tentar de novo</button>}
          {t.error && <button aria-label="Fechar" onClick={() => dismissToast(t.id)}>✕</button>}
          {t.pullPath && <button onClick={() => { dismissToast(t.id); void actions.pullNow(t.pullPath!) }}>Pull agora</button>}
        </div>
      ))}
    </div>
  )
}
