import type { ButtonHTMLAttributes } from 'react'
import { Icon, type IconName } from './Icon'

interface Props extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'children' | 'aria-label'> {
  icon: IconName
  label: string
  size?: number
  strokeWidth?: number
}

export function IconButton({ icon, label, size, strokeWidth, title, ...rest }: Props) {
  return <button {...rest} aria-label={label} title={title ?? label}><Icon name={icon} size={size} strokeWidth={strokeWidth} /></button>
}
