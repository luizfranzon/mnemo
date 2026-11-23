import type { ButtonHTMLAttributes } from 'react'
import { cx } from './cx'
import { Spinner } from './Spinner'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  primary?: boolean
  danger?: boolean
  tinted?: boolean
  small?: boolean
  loading?: boolean
}

export function Button({ primary, danger, tinted, small, loading, className, disabled, children, ...rest }: Props) {
  return <button {...rest} className={cx('btn', primary && 'primary', danger && 'danger', tinted && 'tinted', small && 'small', loading && 'btn-loading', className)} disabled={disabled || loading} aria-busy={loading || undefined}>
    {loading ? <><span className="btn-label">{children}</span><span className="btn-spinner"><Spinner /></span></> : children}
  </button>
}
