import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'
import { Spinner } from './Spinner'

interface Props extends ButtonHTMLAttributes<HTMLButtonElement> {
  icon: IconName
  iconTone?: 'behind' | 'ahead'
  spinLabel?: string
  badge?: { count: number | null | undefined; tone: 'blue' | 'green' | 'gray' }
}

export function ToolbarButton({ icon, iconTone, spinLabel, badge, children, ...rest }: Props) {
  const glyph = <Icon name={icon} size={16} />
  return <button {...rest}>
    {spinLabel ? <Spinner label={spinLabel} /> : <>{iconTone ? <span className={iconTone}>{glyph}</span> : glyph} {children}</>}
    {!!badge?.count && <span className={`count-badge ${badge.tone}`}>{badge.count}</span>}
  </button>
}
