import { useEffect } from 'react'
import { actions, useApp } from '../store/app'
import { RadioGroup } from './RadioGroup'

/** Só entram seções com ajuste real; as demais do mockup chegam com as features (docs/01-features.md § 12). */
export function Preferences() {
  const open = useApp((s) => s.prefsOpen)
  return open && <Screen />
}

function Screen() {
  const initialsOnly = useApp((s) => !s.prefs.gravatar)
  const dateOrder = useApp((s) => s.prefs.dateOrder)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.setPrefsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  return (
    <div className="prefs">
      <nav className="prefs-nav" aria-label="Seções das preferências">
        <button className="back" onClick={() => actions.setPrefsOpen(false)}>← Voltar ao repositório <kbd>Esc</kbd></button>
        <div className="prefs-group">Global</div>
        <button className="item" aria-current="page">Aparência</button>
      </nav>
      <main className="prefs-main">
        <div>
          <h1>Aparência</h1>
          <h2>Grafo</h2>
          <label className="field">
            <input type="checkbox" autoFocus checked={initialsOnly} onChange={(e) => actions.setPref('gravatar', !e.target.checked)} />
            Iniciais no lugar de avatares
          </label>
          <p className="help">Sem foto do Gravatar e sem nenhum request: o hash do email de cada Autor não é enviado a gravatar.com.</p>
          <h2>Ordem dos commits</h2>
          <RadioGroup name="order" label="Ordem dos commits" value={dateOrder ? 'date' : 'topo'}
            onChange={(v) => actions.setPref('dateOrder', v === 'date')}
            options={[
              { value: 'topo', label: 'Agrupada por branch (topológica)' },
              { value: 'date', label: 'Por data, intercalando branches' },
            ]} />
          <p className="help">A topológica deixa cada branch compacta e com menos cruzamento de linhas. Por data, um commit recente de uma branch pode aparecer acima de merges mais antigos de outras.</p>
        </div>
      </main>
    </div>
  )
}
