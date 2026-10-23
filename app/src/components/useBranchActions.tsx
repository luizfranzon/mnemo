import { useState } from 'react'
import { core } from '../bridge'
import { actions, runningLabel, useApp } from '../store/app'
import { localRef, remoteRef, selectVisibility, toggleHidden, toggleHighlight, toggleSolo, updateVisibility, useVisibility } from '../store/visibility'
import { BranchDialogs } from './BranchDialogs'
import { branchMenu, remoteOf, type BranchDialog, type BranchTarget } from './branchMenu'
import { Menu } from './Menu'
import type { MenuEntry, Rect } from './menuModel'
import { toolbarAvailability } from './toolbarModel'

/** Chave da branch na visibilidade do grafo. */
export const targetRef = (t: BranchTarget) => (t.kind === 'local' ? localRef(t.ref.name) : remoteRef(t.ref.remote, t.ref.name))

/** Checkout, menu e diálogos de uma branch; compartilhado pelo painel de refs e pelas pills do grafo. */
export function useBranchActions(path: string) {
  const running = useApp((s) => runningLabel(s, path))
  const head = useApp((s) => s.tabs.find((t) => t.path === path)?.head)
  const toolbar = useApp((s) => s.tabs.find((t) => t.path === path)?.toolbar)
  const vis = useVisibility(selectVisibility(path))
  const [menu, setMenu] = useState<{ items: MenuEntry[]; anchor: Rect } | null>(null)
  const [dialog, setDialog] = useState<BranchDialog | null>(null)

  const checkout = (t: BranchTarget) => {
    if (t.kind === 'local') {
      if (!t.ref.current) void actions.checkoutRef(path, { type: 'checkout', target: t.ref.name })
    } else if (t.local) {
      const tracks = t.local.upstream === `${t.ref.remote}/${t.ref.name}`
      // remota da branch atual: só avança a local até ela
      if (tracks && t.local.current) void actions.execute(path, { type: 'pull', strategy: 'ffOnly' })
      else void actions.checkoutRef(path, { type: 'checkout', target: t.local.name }, tracks ? (t.local.behind ?? 0) : 0)
    } else void actions.checkoutRef(path, { type: 'checkoutRemote', remote: t.ref.remote, branch: t.ref.name })
  }
  const entries = (t: BranchTarget, remoteUrl: string | null) => {
    const name = targetRef(t)
    return branchMenu(t, {
      head: head!, toolbar: toolbar!, remoteUrl, mutation: toolbarAvailability(head!, toolbar!, running).mutation,
      execute: (kind) => void actions.execute(path, kind), checkout: () => checkout(t), pull: () => void actions.pullNow(path),
      push: () => void actions.requestPush(path), newBranch: (start) => actions.setPalette('createBranch', start),
      resetHard: (sha) => void actions.requestResetHard(path, sha), review: (branch) => void actions.requestReview(path, branch), dialog: setDialog,
      copy: (text) => void navigator.clipboard.writeText(text).catch(() => undefined),
      view: { hidden: vis.hidden.includes(name), solo: vis.solo === name, highlight: vis.highlight === name },
      toggleView: (what) => updateVisibility(path, (v) => ({ hidden: toggleHidden, solo: toggleSolo, highlight: toggleHighlight })[what](v, name)),
    })
  }
  const open = async (t: BranchTarget, anchor: Rect) => {
    if (!head || !toolbar) return
    const remote = remoteOf(t, toolbar.remotes)
    const url = remote ? await core.remoteUrl(path, remote.remote).catch(() => null) : null
    setMenu({ items: entries(t, url), anchor })
  }
  const overlay = <>
    {menu && <Menu items={menu.items} anchor={menu.anchor} label="Menu da branch" onClose={() => setMenu(null)} />}
    {dialog && <BranchDialogs path={path} dialog={dialog} close={() => setDialog(null)} />}
  </>
  return { checkout, entries, open, overlay, ready: !!head && !!toolbar }
}
