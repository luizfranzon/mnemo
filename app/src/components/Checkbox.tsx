import type { ReactNode } from 'react'

interface Props {
  checked: boolean
  onChange: (checked: boolean) => void
  label: ReactNode
  help?: ReactNode
  disabled?: boolean
  indeterminate?: boolean
  className?: string
  title?: string
}

export function Checkbox({ checked, onChange, label, help, disabled, indeterminate, className, title }: Props) {
  return <>
    <label className={className} title={title}>
      <input type="checkbox" checked={checked} disabled={disabled} ref={(el) => { if (el) el.indeterminate = indeterminate === true }} onChange={(e) => onChange(e.target.checked)} /> {label}
    </label>
    {help && <p className="help">{help}</p>}
  </>
}
