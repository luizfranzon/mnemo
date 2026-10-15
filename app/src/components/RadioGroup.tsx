interface Option<T extends string> { value: T; label: string; help?: string }

interface Props<T extends string> {
  name: string
  label: string
  value: T
  options: Option<T>[]
  onChange: (value: T) => void
}

/** Escolha única entre opções. Usa o `<input type="radio">` nativo (teclado e leitor de tela de graça), estilizado em `.radio`. */
export function RadioGroup<T extends string>({ name, label, value, options, onChange }: Props<T>) {
  return (
    <div className="radio-group" role="radiogroup" aria-label={label}>
      {options.map((o) => (
        <label key={o.value} className="radio">
          <input type="radio" name={name} checked={o.value === value} onChange={() => onChange(o.value)} />
          <span>{o.label}{o.help && <span className="radio-help">{o.help}</span>}</span>
        </label>
      ))}
    </div>
  )
}
