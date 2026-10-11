// Menus da janela (claude-design/docs/01-features.md § Menus da janela). Montados na hora de abrir, a partir de
// um retrato da store: a barra de título não assina estado que muda a cada Operação.
import { core } from '../bridge'
import { actions, runningLabel, selectActiveTab, useApp, type Tab } from '../store/app'
import type { ActionState } from '../bridge/types'
import type { MenuEntry } from './menuModel'

export interface MenuContext {
  tab: Tab | undefined
  tabs: { path: string; name: string }[]
  /** Operação em curso na Aba ativa. */
  running: string | undefined
  /** Foco num campo de texto: Editar mostra também o desfazer da digitação. */
  textFocus: boolean
}

export function menuContext(textFocus: boolean): MenuContext {
  const s = useApp.getState()
  const tab = selectActiveTab(s)
  return { tab, tabs: s.tabs, running: tab && runningLabel(s, tab.path), textFocus }
}

const SOON = 'Ainda não disponível'

export function windowMenus({ tab, tabs, running, textFocus }: MenuContext): { label: string; items: MenuEntry[] }[] {
  const soon = (label: string, shortcut?: string): MenuEntry => ({ label, shortcut, reason: SOON })
  const soonSub = (label: string): MenuEntry => ({ label, reason: SOON, submenu: [] })
  const noRepo = tab ? undefined : 'Abra um repositório'
  const busy = noRepo ?? (running ? `${running} Aguarde terminar.` : undefined)
  const path = tab?.path ?? ''
  const branch = tab?.head.kind === 'branch' ? tab.head : undefined
  const op = (verb: string, state: ActionState | undefined, run: () => void, shortcut: string): MenuEntry => ({
    label: state?.enabled ? state.label! : verb,
    reason: busy ?? (state?.enabled ? undefined : (state?.reason ?? undefined)),
    shortcut: textFocus ? undefined : shortcut, // com foco em campo o atalho desfaz a digitação
    run,
  })

  return [
    {
      label: 'Arquivo',
      items: [
        soon('Nova aba', 'Ctrl+T'),
        { label: 'Fechar aba', shortcut: 'Ctrl+W', reason: noRepo, run: () => actions.closeTab(path) },
        soon('Reabrir aba fechada', 'Ctrl+Shift+T'),
        '-',
        soon('Clonar…', 'Ctrl+N'),
        soon('Iniciar repositório…', 'Ctrl+I'),
        { label: 'Abrir repositório…', shortcut: 'Ctrl+O', run: () => void actions.openRepository() },
        soon('Repositórios', 'Ctrl+Alt+O'),
        '-',
        soon('Abrir no editor', 'Ctrl+Shift+E'),
        soon('Abrir terminal', 'Alt+T'),
        soon('Abrir pasta', 'Alt+O'),
        '-',
        soon('Preferências', 'Ctrl+,'),
        { label: 'Sair', shortcut: 'Ctrl+Q', run: () => void core.window('quit') },
      ],
    },
    {
      label: 'Editar',
      items: [
        ...(textFocus ? [{ label: 'Desfazer digitação', shortcut: 'Ctrl+Z', run: () => void core.window('undo') }] : []),
        op('Desfazer', tab?.undo.undo, () => void actions.undo(path), 'Ctrl+Z'),
        ...(textFocus ? [{ label: 'Refazer digitação', shortcut: 'Ctrl+Y', run: () => void core.window('redo') }] : []),
        op('Refazer', tab?.undo.redo, () => void actions.redo(path), 'Ctrl+Y'),
        '-',
        { label: 'Recortar', shortcut: 'Ctrl+X', run: () => void core.window('cut') },
        { label: 'Copiar', shortcut: 'Ctrl+C', run: () => void core.window('copy') },
        { label: 'Colar', shortcut: 'Ctrl+V', run: () => void core.window('paste') },
        { label: 'Selecionar tudo', shortcut: 'Ctrl+A', run: () => void core.window('selectAll') },
        '-',
        soon('Buscar commits', 'Ctrl+F'),
      ],
    },
    {
      label: 'Exibir',
      items: [
        { label: 'Tela cheia', shortcut: 'F11', run: () => void core.window('toggleFullScreen') },
        {
          label: 'Zoom',
          submenu: [
            { label: 'Aumentar', shortcut: 'Ctrl+=', run: () => void core.window('zoomIn') },
            { label: 'Diminuir', shortcut: 'Ctrl+-', run: () => void core.window('zoomOut') },
            { label: 'Tamanho original', shortcut: 'Ctrl+0', run: () => void core.window('zoomReset') },
          ],
        },
        {
          label: 'Abas',
          reason: tabs.length ? undefined : 'Nenhuma aba aberta',
          submenu: tabs.map((t) => ({ label: t.name, run: () => actions.focusTab(t.path) })),
        },
        soonSub('Favoritos'),
        '-',
        { label: 'Painel esquerdo', shortcut: 'Ctrl+J', reason: noRepo, run: () => togglePanel('left') },
        { label: 'Painel do commit', shortcut: 'Ctrl+K', reason: noRepo, run: () => togglePanel('right') },
        soon('Terminal', 'Ctrl+`'),
        soon('Densidade'),
      ],
    },
    {
      label: 'Repositório',
      items: [
        { label: 'Fetch', reason: busy, run: () => void actions.execute(path, { type: 'fetch', remote: null }) },
        soonSub('Pull'),
        {
          label: branch ? `Push ${branch.name}` : 'Push',
          reason: busy ?? (tab?.head.kind === 'detached' ? 'HEAD destacado: não há branch para enviar' : undefined),
          run: () => void actions.execute(path, { type: 'push', remote: null, branch: null, setUpstream: branch?.upstream === null }),
        },
        soon('Stash'),
        soon('Pop'),
        '-',
        soon('Nova branch', 'Ctrl+B'),
        { label: 'Checkout…', shortcut: 'Ctrl+Shift+B', reason: busy, run: () => actions.setPalette('checkout') },
        soon('Commitar', 'Ctrl+Enter'),
        soon('Amend'),
        '-',
        soon('Merge…'),
        soon('Rebase…'),
        soon('Cherry-pick…'),
        '-',
        soon('Ajustes do repositório'),
      ],
    },
    {
      label: 'Ajuda',
      items: [
        { label: 'Paleta de comandos', shortcut: 'Ctrl+P', reason: busy, run: () => actions.setPalette('checkout') },
        soon('Atalhos', 'Ctrl+/'),
        '-',
        { label: 'Sobre o Mnemo', run: () => void core.window('about') },
        soon('Novidades'),
        soon('Verificar atualização'),
        soonSub('Logs de suporte'),
      ],
    },
  ]
}

/** O layout mora no `Panels` de cada Aba: ele escuta este evento. */
export const TOGGLE_PANEL = 'mnemo:toggle-panel'
const togglePanel = (side: 'left' | 'right') => window.dispatchEvent(new CustomEvent(TOGGLE_PANEL, { detail: side }))
