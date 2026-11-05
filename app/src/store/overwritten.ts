/** Arquivos que o git recusou sobrescrever ("would be overwritten by merge/checkout"); `[]` se for outro erro. */
export function overwrittenPaths(stderr: string): string[] {
  const lines = stderr.split('\n')
  const start = lines.findIndex((l) => /would be overwritten by/.test(l))
  if (start < 0) return []
  const paths: string[] = []
  for (const l of lines.slice(start + 1)) {
    if (!l.startsWith('\t')) break
    paths.push(l.trim())
  }
  return paths
}
