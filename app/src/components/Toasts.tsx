import type { CSSProperties } from 'react'
import { actions, dismissToast, useApp } from '../store/app'

const Icon = ({ error }: { error: boolean }) => (
  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {error ? <path d="M12 7v6M12 17h.01" /> : <path d="M5 12.5l4.5 4.5L19 7.5" />}
  </svg>
)

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className={t.error ? 'toast error' : 'toast'} key={t.id} role={t.error ? 'alert' : undefined}
          style={{ '--toast-dur': `${t.error ? 12000 : 6000}ms` } as CSSProperties}>
          <span className="toast-icon"><Icon error={!!t.error} /></span>
          <span className="toast-text">{t.text}</span>
          {(t.undoPath || t.pullPath || t.retry) && <span className="toast-actions">
            {t.undoPath && <button onClick={() => { dismissToast(t.id); void actions.undo(t.undoPath!) }}>Desfazer</button>}
            {t.retry && <button onClick={() => { dismissToast(t.id); void t.retry!() }}>Tentar de novo</button>}
            {t.pullPath && <button onClick={() => { dismissToast(t.id); void actions.pullNow(t.pullPath!) }}>Pull agora</button>}
          </span>}
          <button className="toast-close" aria-label="Fechar" onClick={() => dismissToast(t.id)}>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18" /></svg>
          </button>
          <span className="toast-timer" />
        </div>
      ))}
    </div>
  )
}
