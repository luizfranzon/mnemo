import type { InputHTMLAttributes, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react'

interface LabelProps {
  id: string
  label: string
  hideLabel?: boolean
}

function Label({ id, label, hideLabel }: LabelProps) {
  return <label htmlFor={id} className={hideLabel ? 'sr-only' : undefined}>{label}</label>
}

export function TextField({ id, label, hideLabel, ...rest }: LabelProps & InputHTMLAttributes<HTMLInputElement>) {
  return <>
    <Label id={id} label={label} hideLabel={hideLabel} />
    <input id={id} type="text" {...rest} />
  </>
}

export function TextArea({ id, label, hideLabel, ...rest }: LabelProps & TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <>
    <Label id={id} label={label} hideLabel={hideLabel} />
    <textarea id={id} {...rest} />
  </>
}

export function Select({ id, label, hideLabel, children, ...rest }: LabelProps & SelectHTMLAttributes<HTMLSelectElement>) {
  return <>
    <Label id={id} label={label} hideLabel={hideLabel} />
    <select id={id} {...rest}>{children}</select>
  </>
}
