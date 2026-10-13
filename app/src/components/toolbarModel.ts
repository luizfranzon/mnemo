import type { HeadInfo, PullMode, ToolbarInfo } from '../bridge/types'

export const PULL_MODES: { value: PullMode; label: string; button: string }[] = [
  { value: 'fetch', label: 'Fetch tudo', button: 'Fetch' },
  { value: 'merge', label: 'Pull ff se possível', button: 'Pull ff' },
  { value: 'ffOnly', label: 'Pull só ff', button: 'Pull ff' },
  { value: 'rebase', label: 'Pull com rebase', button: 'Pull rebase' },
]

/** Motivos compartilhados pela toolbar e pelos menus que disparam as mesmas ações. */
export function toolbarAvailability(head: HeadInfo, toolbar: ToolbarInfo, running?: string) {
  const busy = running ? `${running} Aguarde terminar.` : undefined
  const mutation = busy ?? (toolbar.progress ? 'Conclua ou aborte o merge/rebase' : undefined)
  const noRemote = toolbar.remotes.length ? undefined : 'Nenhum remoto configurado'
  return {
    busy,
    mutation,
    fetch: busy ?? noRemote,
    pull: mutation ?? (head.kind === 'detached' ? 'HEAD destacado: crie uma branch para fazer Pull'
      : head.upstream === null ? 'Esta branch não tem upstream' : undefined),
    push: mutation ?? (head.kind === 'detached' ? 'HEAD destacado: não há branch para enviar' : noRemote),
  }
}
