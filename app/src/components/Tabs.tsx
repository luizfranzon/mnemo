import { Icon, type IconName } from './Icon'

interface Tab<T extends string> { id: T; label: string; icon?: IconName }

export function Tabs<T extends string>({ label, tabs, value, onChange, className }: {
  label: string
  tabs: readonly Tab<T>[]
  value: T
  onChange: (id: T) => void
  className?: string
}) {
  return <div role="tablist" aria-label={label} className={className}>
    {tabs.map((t) => <button key={t.id} role="tab" aria-selected={value === t.id} onClick={() => onChange(t.id)}>
      {t.icon && <Icon name={t.icon} size={14} strokeWidth={2} />}{t.label}</button>)}
  </div>
}
