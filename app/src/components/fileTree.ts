// Linhas de uma lista de arquivos em Caminho (plana) ou Árvore (pastas recolhíveis). Usado no painel do commit, no WIP e no stash.

export type TreeRow<T> =
  | { type: 'dir'; key: string; name: string; path: string; depth: number; count: number }
  | { type: 'file'; key: string; file: T; dir: string; name: string; depth: number }

/** `collapsed` guarda as chaves das pastas recolhidas; `prefix` separa listas que dividem o mesmo conjunto (WIP). */
export function fileRows<T extends { path: string }>(files: T[], view: 'path' | 'tree', collapsed: Set<string>, prefix = ''): TreeRow<T>[] {
  const split = (path: string) => { const i = path.lastIndexOf('/'); return { dir: path.slice(0, i + 1), name: path.slice(i + 1) } }
  if (view === 'path') return files.map((file) => ({ type: 'file', key: `${prefix}${file.path}`, file, ...split(file.path), depth: 0 }))
  const counts = new Map<string, number>()
  for (const f of files) {
    const parts = f.path.split('/')
    for (let i = 1; i < parts.length; i++) { const dir = parts.slice(0, i).join('/'); counts.set(dir, (counts.get(dir) ?? 0) + 1) }
  }
  const rows: TreeRow<T>[] = []
  const seen = new Set<string>()
  for (const file of files) {
    const parts = file.path.split('/')
    let hidden = false
    for (let i = 0; i < parts.length - 1; i++) {
      const dir = parts.slice(0, i + 1).join('/')
      const key = `${prefix}dir:${dir}`
      if (!seen.has(dir)) {
        seen.add(dir)
        if (!hidden) rows.push({ type: 'dir', key, name: parts[i]!, path: dir, depth: i, count: counts.get(dir) ?? 0 })
      }
      if (collapsed.has(key)) hidden = true
    }
    if (!hidden) rows.push({ type: 'file', key: `${prefix}${file.path}`, file, dir: '', name: parts.at(-1)!, depth: parts.length - 1 })
  }
  return rows
}

export type FileSort = 'path' | 'name' | 'status'
export const FILE_SORTS: readonly { id: FileSort; label: string }[] = [{ id: 'path', label: 'caminho' }, { id: 'name', label: 'nome' }, { id: 'status', label: 'status' }]
const STATUS_ORDER = 'UMADRCT'

/** `path` mantém a ordem recebida; `name` ordena pelo nome do arquivo; `status` agrupa por M/A/D/R… e desempata pelo caminho. */
export function sortFiles<T extends { path: string; status: string }>(files: T[], sort: FileSort): T[] {
  if (sort === 'path') return files
  const name = (f: T) => f.path.slice(f.path.lastIndexOf('/') + 1)
  const rank = (f: T) => { const i = STATUS_ORDER.indexOf(f.status); return i < 0 ? STATUS_ORDER.length : i }
  const order = sort === 'name' ? (a: T, b: T) => name(a).localeCompare(name(b)) || a.path.localeCompare(b.path) : (a: T, b: T) => rank(a) - rank(b) || a.path.localeCompare(b.path)
  return [...files].sort(order)
}

/** `needle` já em minúsculas; vazio não filtra. */
export const filterFiles = <T extends { path: string }>(files: T[], needle: string) => (needle ? files.filter((f) => f.path.toLocaleLowerCase().includes(needle)) : files)

/** Arquivos que estão dentro de `dir` (em qualquer profundidade). */
export const filesUnder = <T extends { path: string }>(files: T[], dir: string) => files.filter((f) => f.path.startsWith(`${dir}/`))
