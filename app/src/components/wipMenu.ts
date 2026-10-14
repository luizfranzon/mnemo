// Menus do painel WIP (docs/specs/12-acoes-por-pasta-e-stash-parcial.md): arquivos (um ou a seleção) e pasta no modo árvore.
import type { FileChange } from '../bridge/types'
import type { MenuEntry } from './menuModel'

export interface WipMenuContext {
  stage: (paths: string[], on: boolean) => void
  discard: (paths: string[]) => void
  /** Pede confirmação antes de guardar. */
  stash: (paths: string[]) => void
  ignore: (pattern: string) => void
  openDiff: (file: FileChange) => void
  copy: (text: string) => void
}

const TRACKED = 'Arquivo já rastreado: o .gitignore não vale para ele'

/** `/caminho`, `*.ext` e `/pasta/`, ancorados na raiz do repositório. */
export function ignoreOptions(path: string): { label: string; pattern: string }[] {
  const slash = path.lastIndexOf('/')
  const name = path.slice(slash + 1)
  const dot = name.lastIndexOf('.')
  const options = [{ label: `Ignorar ${name}`, pattern: `/${path}` }]
  if (dot > 0) options.push({ label: `Ignorar todos os *${name.slice(dot)}`, pattern: `*${name.slice(dot)}` })
  if (slash > 0) options.push({ label: `Ignorar a pasta ${path.slice(0, slash)}/`, pattern: `/${path.slice(0, slash)}/` })
  return options
}

/** Um arquivo ou vários da mesma seção (Preparados ou Não preparados). */
export function wipFilesMenu(files: FileChange[], staged: boolean, c: WipMenuContext): MenuEntry[] {
  const paths = files.map((f) => f.path)
  const one = files.length === 1 ? files[0]! : null
  const what = one ? 'arquivo' : `${files.length} arquivos`
  const items: MenuEntry[] = [
    { label: one ? one.path : `${files.length} arquivos selecionados`, heading: true },
    { label: `${staged ? 'Tirar' : 'Preparar'} ${what}`, run: () => c.stage(paths, !staged) },
  ]
  if (!staged) items.push({ label: `Descartar mudanças ${one ? 'do arquivo' : `de ${what}`}…`, danger: true, run: () => c.discard(paths) })
  items.push({ label: `Guardar ${what} no stash…`, run: () => c.stash(paths) })
  if (!one) return items
  items.push('-', { label: 'Abrir diff', run: () => c.openDiff(one) })
  if (!staged) {
    items.push('-', ...ignoreOptions(one.path).map((o): MenuEntry => ({ label: o.label, reason: one.status === 'A' ? undefined : TRACKED, run: () => c.ignore(o.pattern) })))
  }
  items.push('-', { label: 'Copiar caminho relativo', run: () => c.copy(one.path) })
  return items
}

/** Pasta no modo árvore: age em tudo que está dentro dela, naquela seção. */
export function wipFolderMenu(dir: string, staged: boolean, c: WipMenuContext): MenuEntry[] {
  const items: MenuEntry[] = [
    { label: `${dir}/`, heading: true },
    { label: `${staged ? 'Tirar' : 'Preparar'} pasta`, run: () => c.stage([dir], !staged) },
  ]
  if (!staged) items.push({ label: 'Descartar mudanças da pasta…', danger: true, run: () => c.discard([dir]) })
  items.push({ label: 'Guardar pasta no stash…', run: () => c.stash([dir]) })
  if (!staged) items.push('-', { label: 'Adicionar pasta ao .gitignore', run: () => c.ignore(`/${dir}/`) })
  return items
}

/**
 * Seleção de arquivos no WIP: clique simples fica só com o arquivo, `Ctrl` alterna, `Shift` estende do
 * último clicado. `keys` são as linhas visíveis da mesma seção, em ordem (a seleção nunca mistura seções).
 */
export function pickFiles(selected: Set<string>, anchor: string | null, clicked: string, keys: string[], mods: { ctrl: boolean; shift: boolean }): Set<string> {
  const from = anchor === null ? -1 : keys.indexOf(anchor)
  if (mods.shift && from >= 0) {
    const to = keys.indexOf(clicked)
    const range = keys.slice(Math.min(from, to), Math.max(from, to) + 1)
    return new Set(mods.ctrl ? [...[...selected].filter((k) => keys.includes(k)), ...range] : range)
  }
  if (mods.ctrl) {
    const next = new Set([...selected].filter((k) => keys.includes(k)))
    if (next.has(clicked)) next.delete(clicked)
    else next.add(clicked)
    return next
  }
  return new Set([clicked])
}
