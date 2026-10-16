import type { HeadInfo, LocalRef, OperationKind, RemoteRef, ToolbarInfo } from '../bridge/types'
import type { MenuEntry } from './menuModel'

export type BranchTarget = { kind: 'local'; ref: LocalRef } | { kind: 'remote'; ref: RemoteRef; local?: LocalRef }

/** Diálogos abertos pelo menu (o RefPanel os renderiza). `local`/`remote` nulos = a parte não existe. */
export type BranchDialog =
  | { type: 'rename'; from: string }
  | { type: 'delete'; /** Lado clicado: começa marcado. */ from: 'local' | 'remote'; local: { name: string; current: boolean } | null; remote: { remote: string; branch: string } | null }

export interface BranchMenuContext {
  head: HeadInfo
  toolbar: ToolbarInfo
  /** Motivo de nenhuma Operação poder rodar agora (outra em curso, merge/rebase pendente). */
  mutation?: string
  /** URL do remoto da branch, para o link do GitHub (`null` = sem remoto). */
  remoteUrl: string | null
  execute(kind: OperationKind): void
  checkout(): void
  pull(): void
  push(): void
  newBranch(start: string): void
  resetHard(sha: string): void
  dialog(d: BranchDialog): void
  copy(text: string): void
  /** Estado atual desta branch no grafo e como alterná-lo. */
  view: { hidden: boolean; solo: boolean; highlight: boolean }
  toggleView(what: 'hidden' | 'solo' | 'highlight'): void
}

export const targetName = (t: BranchTarget) => (t.kind === 'local' ? t.ref.name : `${t.ref.remote}/${t.ref.name}`)

/** `origin/feature/x` → `{ remote: 'origin', branch: 'feature/x' }` (o nome do remoto sai da lista configurada). */
export function splitUpstream(upstream: string, remotes: string[]) {
  const remote = remotes.find((r) => upstream.startsWith(`${r}/`))
  return remote ? { remote, branch: upstream.slice(remote.length + 1) } : null
}

/** Remoto da branch: o da própria ref remota, o do upstream, ou origin/o primeiro configurado. */
export function remoteOf(t: BranchTarget, remotes: string[]): { remote: string; branch: string } | null {
  if (t.kind === 'remote') return { remote: t.ref.remote, branch: t.ref.name }
  const up = t.ref.upstream ? splitUpstream(t.ref.upstream, remotes) : null
  const remote = up?.remote ?? (remotes.includes('origin') ? 'origin' : remotes[0])
  return remote ? { remote, branch: up?.branch ?? t.ref.name } : null
}

/** `https://github.com/dono/repo` a partir da URL do remoto (`null` = não é do GitHub). */
export function githubBase(remoteUrl: string | null): string | null {
  const m = remoteUrl?.trim().match(/^(?:https?:\/\/(?:[^@/]+@)?|git@|ssh:\/\/git@)github\.com[:/](.+?)(?:\.git)?\/?$/)
  return m ? `https://github.com/${m[1]}` : null
}

export function githubBranchUrl(remoteUrl: string | null, branch: string): string | null {
  const base = githubBase(remoteUrl)
  return base && `${base}/tree/${encodeURI(branch)}`
}

/** Reset da branch atual para `sha`: Soft e Mixed rodam direto, Hard confirma antes. */
export function resetItem(sha: string, short: string, cur: string | null, mut: string | undefined, c: Pick<BranchMenuContext, 'execute' | 'resetHard'>, label = short): MenuEntry {
  return { label: `Reset ${cur ?? 'HEAD'} para ${label}`, reason: mut, submenu: [
    { label: 'Soft: mantém preparadas', run: () => c.execute({ type: 'reset', target: sha, mode: 'soft' }) },
    { label: 'Mixed: mantém no diretório', run: () => c.execute({ type: 'reset', target: sha, mode: 'mixed' }) },
    { label: 'Hard: descarta', danger: true, run: () => c.resetHard(sha) },
  ] }
}

export function branchMenu(t: BranchTarget, c: BranchMenuContext): MenuEntry[] {
  const name = targetName(t)
  const local = t.kind === 'local' ? t.ref : null
  const current = !!local?.current
  const mut = c.mutation
  const cur = c.head.kind === 'branch' ? c.head.name : null
  const integrate = mut ?? (cur === null ? 'HEAD destacado: faça checkout de uma branch' : current ? `${name} já é a branch atual` : undefined)
  const noRemote = c.toolbar.remotes.length ? undefined : 'Nenhum remoto configurado'
  const sha = t.ref.sha
  const short = sha.slice(0, 7)
  const link = githubBranchUrl(c.remoteUrl, remoteOf(t, c.toolbar.remotes)?.branch ?? t.ref.name)
  const up = local?.upstream ? splitUpstream(local.upstream, c.toolbar.remotes) : null

  const header = local
    ? `${name} · ↑${local.ahead ?? '–'} ↓${local.behind ?? '–'} · ${local.upstream ? `rastreia ${local.upstream}` : 'sem upstream'}`
    : `${name} · remota`
  const deleteDialog = (): BranchDialog => t.kind === 'local'
    ? { type: 'delete', from: 'local', local: { name, current }, remote: up }
    : { type: 'delete', from: 'remote', local: t.local ? { name: t.local.name, current: t.local.current } : null, remote: { remote: t.ref.remote, branch: t.ref.name } }
  const setUpstream = (remote: string): OperationKind => ({ type: 'push', remote, branch: name, setUpstream: true })

  const items: MenuEntry[] = [
    { label: header, heading: true },
    { label: `Fazer checkout de ${name}`, shortcut: 'duplo clique', reason: mut ?? (current ? 'Já é a branch atual' : undefined), run: c.checkout },
    { label: `Merge ${name} em ${cur ?? 'HEAD'}`, reason: integrate, run: () => c.execute({ type: 'merge', target: name }) },
    { label: `Rebase ${cur ?? 'HEAD'} sobre ${name}`, reason: integrate, run: () => c.execute({ type: 'rebase', onto: name }) },
  ]
  if (local) {
    const noUpstream = local.upstream ? undefined : 'Esta branch não tem upstream'
    items.push('-',
      { label: `Pull ${name}`, reason: mut ?? (current ? noUpstream : `Faça checkout de ${name} para dar pull`), run: c.pull },
      { label: `Push ${name}`, reason: mut ?? noRemote ?? (current ? undefined : noUpstream),
        run: () => (current ? c.push() : c.execute({ type: 'push', remote: up?.remote ?? null, branch: name, setUpstream: false })) },
      c.toolbar.remotes.length > 1
        ? { label: 'Definir upstream', reason: mut, submenu: c.toolbar.remotes.map((r) => ({ label: r, run: () => c.execute(setUpstream(r)) })) }
        : { label: 'Definir upstream', reason: mut ?? noRemote, run: () => c.execute(setUpstream(c.toolbar.remotes[0]!)) })
  }
  items.push('-',
    { label: 'Nova branch a partir daqui', shortcut: 'Ctrl+B', reason: mut, run: () => c.newBranch(name) },
    '-',
    { label: `Commit da ponta (${short})`, submenu: [
      { label: `Cherry-pick ${short}`, reason: mut, run: () => c.execute({ type: 'cherryPick', commit: sha }) },
      { label: `Revert ${short}`, reason: mut, run: () => c.execute({ type: 'revert', commit: sha }) },
      resetItem(sha, short, cur, mut, c),
      { label: 'Copiar SHA', run: () => c.copy(sha) },
    ] },
    '-')
  if (local) items.push({ label: 'Renomear', shortcut: 'F2', reason: mut, run: () => c.dialog({ type: 'rename', from: name }) })
  items.push(
    { label: `Excluir ${name}`, danger: true, reason: mut ?? (current && !up ? 'Não dá para excluir a branch atual' : undefined), run: () => c.dialog(deleteDialog()) },
    { label: 'Copiar nome', run: () => c.copy(name) },
    { label: 'Copiar link no GitHub', reason: link ? undefined : 'O remoto não é do GitHub', run: () => link && c.copy(link) },
    '-',
    { label: c.view.hidden ? 'Mostrar no grafo' : 'Ocultar no grafo', run: () => c.toggleView('hidden') },
    { label: c.view.solo ? 'Sair do Solo' : 'Solo', run: () => c.toggleView('solo') },
    { label: c.view.highlight ? 'Remover destaque' : 'Destacar no grafo', run: () => c.toggleView('highlight') },
  )
  return items
}
