import { core } from '../bridge'
import { runningLabel, useApp } from '../store/app'
import { toolbarAvailability } from './toolbarModel'

export const copyText = (text: string) => void navigator.clipboard.writeText(text).catch(() => undefined)

/** O que os menus do commit e do arquivo pedem à Aba: HEAD, toolbar, bloqueio por Operação em curso e URL do remoto. */
export async function menuBase(path: string) {
  const state = useApp.getState()
  const tab = state.tabs.find((t) => t.path === path)
  if (!tab) return null
  const remote = tab.toolbar.remotes.includes('origin') ? 'origin' : tab.toolbar.remotes[0]
  return {
    head: tab.head,
    toolbar: tab.toolbar,
    mutation: toolbarAvailability(tab.head, tab.toolbar, runningLabel(state, path)).mutation,
    remoteUrl: remote ? await core.remoteUrl(path, remote).catch(() => null) : null,
    copy: copyText,
  }
}
