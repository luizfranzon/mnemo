import type { CSSProperties } from 'react'
import { actions, dismissToast, useApp } from '../store/app'
import { Button } from './Button'
import { IconButton } from './IconButton'

export function Toasts() {
  const toasts = useApp((s) => s.toasts)
  return (
    <div className="toasts" aria-live="polite">
      {toasts.map((t) => (
        <div className={t.error ? 'toast error' : t.info ? 'toast info' : 'toast'} key={t.id} role={t.error ? 'alert' : undefined}
          style={{ '--toast-dur': `${t.error ? 12000 : 6000}ms` } as CSSProperties}>
          <span className="toast-node" aria-hidden="true" />
          <span className="toast-text">{t.title && <span className="toast-title">{t.title}</span>}{t.text}</span>
          {(t.undoPath || t.pullPath || t.retry || t.buttons) && <span className={t.buttons ? "toast-actions below" : "toast-actions"}>
            {t.buttons?.map((b) => <Button key={b.label} onClick={() => { dismissToast(t.id); void b.run() }}>{b.label}</Button>)}
            {t.undoPath && <Button onClick={() => { dismissToast(t.id); void actions.undo(t.undoPath!) }}>Desfazer</Button>}
            {t.retry && <Button onClick={() => { dismissToast(t.id); void t.retry!() }}>Tentar de novo</Button>}
            {t.pullPath && <Button onClick={() => { dismissToast(t.id); void actions.pullNow(t.pullPath!) }}>Pull agora</Button>}
          </span>}
          <IconButton className="toast-close" icon="close" size={12} strokeWidth={2.4} label="Fechar" onClick={() => dismissToast(t.id)} />
          <span className="toast-rail" aria-hidden="true" />
        </div>
      ))}
    </div>
  )
}
