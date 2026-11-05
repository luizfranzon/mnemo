import { actions, useApp } from '../store/app'
import { Icon } from './Icon'

/** `pai › submódulo` nas abas abertas a partir de um submódulo; clicar no pai volta a ele (reabre se foi fechado). */
export function Breadcrumb({ path }: { path: string }) {
  const parent = useApp((s) => s.tabs.find((t) => t.path === path)?.parent)
  const name = useApp((s) => s.tabs.find((t) => t.path === path)?.name)
  if (!parent) return null
  return <nav className="breadcrumb" aria-label="Nível do repositório">
    <button title={`Voltar a ${parent}`} onClick={() => void actions.openRepository(parent)}>{parent.split(/[\\/]/).filter(Boolean).at(-1) ?? parent}</button>
    <Icon name="chevron" size={12} />
    <strong>{name}</strong>
  </nav>
}
