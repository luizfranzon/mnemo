/** Alternador de duas ou mais opções exclusivas; o visual é o do seletor Caminho/Árvore do painel de commit. */
export function Segmented<T extends string>({ label, options, value, onChange }: {
  label: string
  options: readonly { id: T; label: string }[]
  value: T
  onChange: (id: T) => void
}) {
  return <div role="group" aria-label={label} className="segmented">
    {options.map((o) => <button key={o.id} className="seg-btn" aria-pressed={value === o.id} onClick={() => onChange(o.id)}>{o.label}</button>)}
  </div>
}

export const FILE_VIEWS = [{ id: 'path', label: 'Caminho' }, { id: 'tree', label: 'Árvore' }] as const
