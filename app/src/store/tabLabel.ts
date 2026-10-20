/** Nome da aba; se outra aba aberta tem o mesmo nome, ganha o menor trecho do caminho pai que as diferencia. */
export function tabLabel(tabs: readonly { path: string; name: string }[], path: string): string | undefined {
  const me = tabs.find((t) => t.path === path)
  if (!me) return undefined
  const twins = tabs.filter((t) => t !== me && t.name === me.name)
  if (!twins.length) return me.name
  const parents = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').slice(0, -1)
  const mine = parents(me.path)
  const others = twins.map((t) => parents(t.path))
  for (let k = 1; k < mine.length; k++) {
    const tail = mine.slice(-k).join('/')
    if (others.every((o) => o.slice(-k).join('/') !== tail)) return `${me.name} — ${tail}`
  }
  return `${me.name} — ${mine.join('/')}`
}
