import type { HeadInfo } from '../bridge/types'

interface LabelTab { path: string; name: string; mainRepoName?: string | null; head?: HeadInfo }

function baseName(tab: LabelTab): string {
  if (!tab.mainRepoName) return tab.name
  const where = tab.head?.kind === 'branch' ? tab.head.name : tab.name
  return `${tab.mainRepoName} - ${where}`
}

/** Nome da aba; worktree vira `<repo> - <branch>`. Se outra aba aberta tem o mesmo nome, ganha o menor trecho do caminho pai que as diferencia. */
export function tabLabel(tabs: readonly LabelTab[], path: string): string | undefined {
  const me = tabs.find((t) => t.path === path)
  if (!me) return undefined
  const myName = baseName(me)
  const twins = tabs.filter((t) => t !== me && baseName(t) === myName)
  if (!twins.length) return myName
  const parents = (p: string) => p.replace(/\\/g, '/').replace(/\/+$/, '').split('/').slice(0, -1)
  const mine = parents(me.path)
  const others = twins.map((t) => parents(t.path))
  for (let k = 1; k < mine.length; k++) {
    const tail = mine.slice(-k).join('/')
    if (others.every((o) => o.slice(-k).join('/') !== tail)) return `${myName} — ${tail}`
  }
  return `${myName} — ${mine.join('/')}`
}

export interface TabParts { name: string; branch: string; worktree: boolean }

/** Partes da aba em duas linhas: repo (com o trecho do pai quando há gêmeas) e branch do HEAD; HEAD destacado mostra o sha curto, e em worktree a pasta. */
export function tabParts(tabs: readonly LabelTab[], path: string): TabParts | undefined {
  const me = tabs.find((t) => t.path === path)
  const label = tabLabel(tabs, path)
  if (!me || label === undefined) return undefined
  const disambiguation = label.slice(baseName(me).length)
  const worktree = Boolean(me.mainRepoName)
  const repo = me.mainRepoName ?? me.name
  if (me.head?.kind === 'branch') return { name: repo + disambiguation, branch: me.head.name, worktree }
  const detached = worktree ? me.name : (me.head?.sha.slice(0, 7) ?? '')
  return { name: repo + disambiguation, branch: detached, worktree }
}
