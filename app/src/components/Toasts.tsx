import type { CSSProperties } from 'react'
import { actions, dismissToast, useApp } from '../store/app'
import { Icon } from './Icon'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className={t.error ? 'toast error' : t.info ? 'toast info' : 'toast'} key={t.id} role={t.error ? 'alert' : undefined}
          style={{ '--toast-dur': `${t.error ? 12000 : 6000}ms` } as CSSProperties}>
          <span className="toast-node" aria-hidden="true" />
          <span className="toast-text">{t.title && <span className="toast-title">{t.title}</span>}{t.text}</span>
          {(t.undoPath || t.pullPath || t.retry) && <span className="toast-actions">
            {t.undoPath && <button onClick={() => { dismissToast(t.id); void actions.undo(t.undoPath!) }}>Desfazer</button>}
            {t.retry && <button onClick={() => { dismissToast(t.id); void t.retry!() }}>Tentar de novo</button>}
            {t.pullPath && <button onClick={() => { dismissToast(t.id); void actions.pullNow(t.pullPath!) }}>Pull agora</button>}
          </span>}
          <button className="toast-close" aria-label="Fechar" onClick={() => dismissToast(t.id)}>
            <Icon name="close" size={12} strokeWidth={2.4} />
          </button>
          <span className="toast-rail" aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
