import { useEffect, useRef, type ReactNode, type SyntheticEvent } from 'react'
import { cx } from './cx'

interface Props {
  titleId: string
  onCancel: (event: SyntheticEvent<HTMLDialogElement>) => void
  className?: string
  children: ReactNode
}

export function Dialog({ titleId, onCancel, className, children }: Props) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  return <dialog ref={ref} className={cx('push-dialog card', className)} aria-labelledby={titleId} onCancel={onCancel}>{children}</dialog>
}

export function DialogActions({ children }: { children: ReactNode }) {
  return <div className="actions">{children}</div>
}
