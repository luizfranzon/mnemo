import type { ComponentProps } from 'react'
import { Icon, type IconName } from './Icon'
import './Button.css'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'success' | 'danger' | 'danger-solid' | 'ai'
export type ButtonSize = 'sm' | 'md' | 'lg'

type Base = { variant?: ButtonVariant; size?: ButtonSize }

const cls = (variant: ButtonVariant, size: ButtonSize, extra?: string) => `btn btn--${variant} btn--${size}${extra ? ` ${extra}` : ''}`

export function Button({ variant = 'secondary', size = 'md', className, type = 'button', ...rest }: Base & ComponentProps<'button'>) {
  return <button type={type} className={cls(variant, size, className)} {...rest} />
}

export function IconButton({ label, icon, iconSize = 14, variant = 'ghost', size = 'md', className, type = 'button', title, ...rest }:
  Base & Omit<ComponentProps<'button'>, 'children' | 'aria-label'> & { label: string; icon: IconName; iconSize?: number }) {
  return <button type={type} aria-label={label} title={title ?? label} className={cls(variant, size, `btn--icon${className ? ` ${className}` : ''}`)} {...rest}>
    <Icon name={icon} size={iconSize} />
  </button>
}
