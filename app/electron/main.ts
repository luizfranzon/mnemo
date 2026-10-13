// Processo main: janela sem moldura e IPC (os menus moram na UI). Nenhuma regra de git mora aqui (ela vive no mnemo-core).
// O pool do libuv roda as chamadas ao core; uma fila de Operações bloqueia uma thread enquanto espera.
process.env.UV_THREADPOOL_SIZE ??= '16'

import { app, BrowserWindow, dialog, ipcMain, Menu, shell } from 'electron'
import { spawn } from 'node:child_process'
import { existsSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'

interface Native {
  init(dataDir: string, onEvent: (json: string) => void): void
  invoke(cmd: string, argsJson: string): Promise<string>
}

let native: Native
let window: BrowserWindow | null = null

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

/** Ações da barra de título da UI: controles da janela e edição nativa no campo focado. */
const windowActions: Record<string, (w: BrowserWindow) => void> = {
  minimize: (w) => w.minimize(),
  toggleMaximize: (w) => (w.isMaximized() ? w.unmaximize() : w.maximize()),
  close: (w) => w.close(),
  quit: () => app.quit(),
  toggleFullScreen: (w) => w.setFullScreen(!w.isFullScreen()),
  zoomIn: (w) => w.webContents.setZoomLevel(w.webContents.getZoomLevel() + 0.5),
  zoomOut: (w) => w.webContents.setZoomLevel(w.webContents.getZoomLevel() - 0.5),
  zoomReset: (w) => w.webContents.setZoomLevel(0),
  about: () => app.showAboutPanel(),
  undo: (w) => w.webContents.undo(),
  redo: (w) => w.webContents.redo(),
  cut: (w) => w.webContents.cut(),
  copy: (w) => w.webContents.copy(),
  paste: (w) => w.webContents.paste(),
  selectAll: (w) => w.webContents.selectAll(),
}

function createWindow() {
  window = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 560,
    frame: false, // menus e controles da janela moram na barra de título da UI
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
  /** Abre um arquivo do repositório fora do app. O caminho nunca sai do diretório de trabalho. */
  async open_file(args) {
    const full = resolve(String(args.workdir), String(args.file))
    if (relative(String(args.workdir), full).startsWith('..')) throw new Error('caminho fora do repositório')
    if (args.how === 'folder') {
      if (!existsSync(full)) throw new Error(`o arquivo não existe mais no diretório de trabalho: ${String(args.file)}`)
      shell.showItemInFolder(full)
    } else if (args.how === 'editor') {
      const editor = process.env.VISUAL || process.env.EDITOR || 'code'
      const child = spawn(editor, [full], { shell: true, detached: true, stdio: 'ignore' })
      child.on('exit', (code) => { if (code) void shell.openPath(full) }) // editor ausente: cai no programa padrão
      child.unref()
    } else {
      const error = await shell.openPath(full)
      if (error) throw new Error(error)
    }
    return null
  },
  window_action(args) {
    const run = windowActions[String(args.action)]
    if (!run) throw new Error(`ação de janela desconhecida: ${String(args.action)}`)
    if (window) run(window)
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
  Menu.setApplicationMenu(null)
  createWindow()
  app.on('activate', () => BrowserWindow.getAllWindows().length === 0 && createWindow())
})

app.on('window-all-closed', () => process.platform !== 'darwin' && app.quit())
