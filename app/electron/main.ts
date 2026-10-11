// Processo main: janela, menu nativo e IPC. Nenhuma regra de git mora aqui (ela vive no mnemo-core).
// O pool do libuv roda as chamadas ao core; uma fila de Operações bloqueia uma thread enquanto espera.
process.env.UV_THREADPOOL_SIZE ??= '16'

import { app, BrowserWindow, dialog, ipcMain, Menu, type MenuItemConstructorOptions } from 'electron'
import { existsSync, statSync } from 'node:fs'
import { join } from 'node:path'

interface Native {
  init(dataDir: string, onEvent: (json: string) => void): void
  invoke(cmd: string, argsJson: string): Promise<string>
}

/** Estado que a UI manda para o menu Editar refletir o Desfazer/Refazer. */
interface MenuState {
  undoLabel: string | null
  undoReason: string | null
  redoLabel: string | null
  redoReason: string | null
  textFocus: boolean
  hasRepo: boolean
}

let native: Native
let window: BrowserWindow | null = null
let menuState: MenuState = { undoLabel: null, undoReason: null, redoLabel: null, redoReason: null, textFocus: false, hasRepo: false }

function loadNative(): Native {
  const base = app.isPackaged ? process.resourcesPath : join(app.getAppPath())
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require(join(base, 'native', 'mnemo.node')) as Native
}

/** Erros do main vão para o Log de diagnóstico do core (único escritor). Nunca lança. */
function logError(context: string, err: unknown) {
  try {
    const text = err instanceof Error ? (err.stack ?? err.message) : String(err)
    void native?.invoke('log_error', JSON.stringify({ context, message: text })).catch(() => {})
  } catch {
    /* o log nunca derruba o app */
  }
}

process.on('uncaughtException', (err) => {
  logError('main', err)
  // sem o core (falha ao carregar) não há onde logar nem como seguir: encerra em vez de ficar zumbi
  if (!native) app.exit(1)
})
process.on('unhandledRejection', (err) => logError('main', err))

function send(channel: string, payload: unknown) {
  window?.webContents.send(channel, payload)
}

function buildMenu() {
  const action = (name: string) => () => send('mnemo:menu', name)
  const undoItem = (label: string | null, reason: string | null, verb: string, name: string): MenuItemConstructorOptions => ({
    label: label ?? `${verb} (${reason ?? 'indisponível'})`,
    enabled: label !== null,
    click: action(name),
  })
  const edit: MenuItemConstructorOptions[] = []
  if (menuState.textFocus) edit.push({ label: 'Desfazer digitação', role: 'undo', accelerator: undefined })
  edit.push(undoItem(menuState.undoLabel, menuState.undoReason, 'Desfazer', 'undo'))
  if (menuState.textFocus) edit.push({ label: 'Refazer digitação', role: 'redo', accelerator: undefined })
  edit.push(undoItem(menuState.redoLabel, menuState.redoReason, 'Refazer', 'redo'))
  edit.push({ type: 'separator' }, { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' })

  const template: MenuItemConstructorOptions[] = [
    {
      label: 'Arquivo',
      submenu: [
        { label: 'Abrir repositório…', accelerator: 'CmdOrCtrl+O', click: action('open-repository') },
        { label: 'Fechar aba', accelerator: 'CmdOrCtrl+W', click: action('close-tab') },
        { type: 'separator' },
        { role: 'quit', label: 'Sair' },
      ],
    },
    { label: 'Editar', submenu: edit },
    {
      label: 'Exibir',
      submenu: [
        { label: 'Painel de refs', accelerator: 'CmdOrCtrl+J', enabled: menuState.hasRepo, click: action('toggle-left') },
        { label: 'Painel direito', accelerator: 'CmdOrCtrl+K', enabled: menuState.hasRepo, click: action('toggle-right') },
        { type: 'separator' },
        { role: 'reload' },
        { role: 'toggleDevTools' },
        { role: 'togglefullscreen' },
      ],
    },
    {
      label: 'Repositório',
      submenu: [{ label: 'Checkout de branch…', accelerator: 'CmdOrCtrl+P', enabled: menuState.hasRepo, click: action('palette') }],
    },
    { label: 'Ajuda', submenu: [{ label: 'Sobre o Mnemo', role: 'about' }] },
  ]
  Menu.setApplicationMenu(Menu.buildFromTemplate(template))
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    backgroundColor: '#0E0E0F',
    webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, sandbox: true, nodeIntegration: false },
  })
  const dev = process.env.MNEMO_DEV_URL
  if (dev) void window.loadURL(dev)
  else void window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
  window.on('closed', () => (window = null))
}

/** Comandos do app (fora do core), no mesmo formato do `invoke`. */
const appCommands: Record<string, (args: Record<string, unknown>) => Promise<unknown> | unknown> = {
  async pick_folder() {
    const r = await dialog.showOpenDialog(window ?? undefined!, { properties: ['openDirectory'], title: 'Abrir repositório' })
    return r.canceled ? null : (r.filePaths[0] ?? null)
  },
  /** Pastas passadas na linha de comando (`mnemo <pasta>`): abrem como Abas. */
  initial_paths() {
    const args = app.isPackaged ? process.argv.slice(1) : process.argv.slice(2)
    return args.filter((a) => !a.startsWith('-') && existsSync(a) && statSync(a).isDirectory())
  },
  set_menu_state(args) {
    menuState = { ...menuState, ...(args as Partial<MenuState>) }
    buildMenu()
    return null
  },
}

function registerIpc() {
  ipcMain.handle('mnemo:invoke', async (_e, cmd: string, args: Record<string, unknown>) => {
    try {
      const local = appCommands[cmd]
      if (local) return { ok: true, value: await local(args ?? {}) }
      const out = await native.invoke(cmd, JSON.stringify(args ?? {}))
      return { ok: true, value: JSON.parse(out) as unknown }
    } catch (err) {
      return { ok: false, error: parseError(err) }
    }
  })
}

/** O core devolve o erro como JSON `{code, message}` na mensagem; qualquer outra falha vira `internal`. */
function parseError(err: unknown): { code: string; message: string } {
  const text = err instanceof Error ? err.message : String(err)
  try {
    const parsed = JSON.parse(text) as { code?: string; message?: string }
    if (parsed.code) return { code: parsed.code, message: parsed.message ?? text, ...parsed } as { code: string; message: string }
  } catch {
    /* mensagem comum */
  }
  return { code: 'internal', message: text }
}

void app.whenReady().then(() => {
  native = loadNative()
  native.init(app.getPath('userData'), (json) => {
    const event = JSON.parse(json) as { type: string }
    send('mnemo:event', event)
  })
  registerIpc()
  buildMenu()
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
