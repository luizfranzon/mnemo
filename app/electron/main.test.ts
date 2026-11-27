import { after, before, beforeEach, mock, test } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

type Handler = (...a: never[]) => unknown
type Result = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } & Record<string, unknown> }

const root = mkdtempSync(join(tmpdir(), 'mnemo-main-'))
const userData = join(root, 'userData')
const workdir = join(root, 'work')
mkdirSync(userData)
mkdirSync(workdir)
writeFileSync(join(workdir, 'a.txt'), 'x')
const stateFile = join(userData, 'window-state.json')

const log = { sent: [] as [string, unknown][], shown: [] as string[], opened: [] as string[], quit: 0, watched: [] as string[], unwatched: 0, updates: [] as string[], menu: [] as unknown[], loaded: [] as string[] }
const nativeCalls = { init: [] as [string, (json: string) => void][], invoke: [] as [string, string][] }
let nativeInvoke: (cmd: string, json: string) => Promise<string> = async () => '{}'
let openResult: { canceled: boolean; filePaths: string[] } = { canceled: true, filePaths: [] }
let saveResult: { canceled: boolean; filePath?: string } = { canceled: true }
let openPathError = ''
let displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
let readyCb: () => void = () => {}
const appHandlers: Record<string, Handler> = {}
const ipc: Record<string, Handler> = {}
const spawned: { editor: string; args: string[]; child: EventEmitter & { unref: () => void } }[] = []

class FakeWindow {
  static all: FakeWindow[] = []
  static getAllWindows() { return FakeWindow.all }
  handlers: Record<string, () => void> = {}
  calls: string[] = []
  minimized = false
  maximized = false
  fullScreen = false
  zoom = 0
  normalBounds = { x: 10, y: 20, width: 1000, height: 700 }
  webContents = {
    send: (channel: string, payload: unknown) => void log.sent.push([channel, payload]),
    once: () => {},
    getZoomLevel: () => this.zoom,
    setZoomLevel: (z: number) => void (this.zoom = z),
    undo: () => void this.calls.push('undo'),
    redo: () => void this.calls.push('redo'),
    cut: () => void this.calls.push('cut'),
    copy: () => void this.calls.push('copy'),
    paste: () => void this.calls.push('paste'),
    selectAll: () => void this.calls.push('selectAll'),
  }
  constructor(public opts: Record<string, unknown>) { FakeWindow.all.push(this) }
  on(event: string, fn: () => void) { this.handlers[event] = fn }
  loadURL(url: string) { log.loaded.push(`url:${url}`) }
  loadFile(file: string) { log.loaded.push(`file:${file}`) }
  minimize() { this.calls.push('minimize') }
  maximize() { this.maximized = true; this.calls.push('maximize') }
  unmaximize() { this.maximized = false; this.calls.push('unmaximize') }
  isMaximized() { return this.maximized }
  isMinimized() { return this.minimized }
  close() { this.calls.push('close') }
  setFullScreen(v: boolean) { this.fullScreen = v }
  isFullScreen() { return this.fullScreen }
  getNormalBounds() { return this.normalBounds }
}

const electron = {
  app: {
    isPackaged: false,
    commandLine: { appendSwitch: () => {} },
    whenReady: () => ({ then: (cb: () => void) => void (readyCb = cb) }),
    getPath: () => userData,
    getAppPath: () => '/app',
    on: (event: string, fn: Handler) => void (appHandlers[event] = fn),
    quit: () => void log.quit++,
    exit: () => {},
    showAboutPanel: () => void log.shown.push('about'),
  },
  BrowserWindow: FakeWindow,
  dialog: { showOpenDialog: async () => openResult, showSaveDialog: async () => saveResult },
  ipcMain: { handle: (channel: string, fn: Handler) => void (ipc[channel] = fn) },
  Menu: { setApplicationMenu: (m: unknown) => void log.menu.push(m) },
  screen: { getAllDisplays: () => displays },
  shell: {
    showItemInFolder: (p: string) => void log.shown.push(p),
    openPath: async (p: string) => { log.opened.push(p); return openPathError },
  },
}

const here = (file: string) => new URL(file, import.meta.url).href
mock.module('electron', { exports: electron })
mock.module('node:child_process', {
  exports: {
    spawn: (editor: string, args: string[]) => {
      const child = Object.assign(new EventEmitter(), { unref: () => {} })
      spawned.push({ editor, args, child })
      return child
    },
  },
})
mock.module(here('./bench.ts'), { exports: { mark: () => {}, now: () => 0, benchWindow: async () => {} } })
mock.module(here('./repoWatcher.ts'), {
  exports: {
    watchRepository: (path: string, cb: () => void) => { log.watched.push(path); cb() },
    unwatchRepository: () => void log.unwatched++,
  },
})
mock.module(here('./updater.ts'), {
  exports: {
    checkForUpdate: async () => void log.updates.push('check'),
    downloadUpdate: () => void log.updates.push('download'),
    installUpdate: () => void log.updates.push('install'),
    updateState: () => ({ status: 'available', version: '9.9.9' }),
    startUpdater: (cb: (s: unknown) => void) => cb({ status: 'ready', version: '9.9.9' }),
  },
})
Object.assign(globalThis, {
  __dirname: '/app/electron',
  require: () => ({
    init: (dir: string, cb: (json: string) => void) => void nativeCalls.init.push([dir, cb]),
    invoke: (cmd: string, json: string) => { nativeCalls.invoke.push([cmd, json]); return nativeInvoke(cmd, json) },
  }),
})

const invoke = (cmd: string, args: Record<string, unknown> = {}) => (ipc['mnemo:invoke'] as (...a: unknown[]) => Promise<Result>)({}, cmd, args)
const win = () => FakeWindow.all.at(-1)!
const value = async (cmd: string, args: Record<string, unknown> = {}) => {
  const r = await invoke(cmd, args)
  assert.ok(r.ok, JSON.stringify(r))
  return r.value
}
const errorOf = async (cmd: string, args: Record<string, unknown> = {}) => {
  const r = await invoke(cmd, args)
  assert.ok(!r.ok, 'esperava erro')
  return r.error
}

before(async () => {
  await import('./main')
})

after(() => rmSync(root, { recursive: true, force: true }))

beforeEach(() => {
  rmSync(stateFile, { force: true })
  FakeWindow.all = []
  log.sent = []; log.shown = []; log.opened = []; log.quit = 0; log.watched = []; log.unwatched = 0; log.updates = []; log.menu = []; log.loaded = []
  nativeCalls.init = []; nativeCalls.invoke = []
  nativeInvoke = async () => '{}'
  openResult = { canceled: true, filePaths: [] }
  saveResult = { canceled: true }
  openPathError = ''
  displays = [{ workArea: { x: 0, y: 0, width: 1920, height: 1080 } }]
  spawned.length = 0
  readyCb()
})

test('ao iniciar, abre o core nos dados do app, sem menu nativo e com janela sem moldura', () => {
  assert.equal(nativeCalls.init[0]![0], userData)
  assert.deepEqual(log.menu, [null])
  assert.equal(win().opts.frame, false)
  assert.equal(win().opts.minWidth, 900)
  assert.deepEqual(win().opts.webPreferences, { preload: '/app/electron/preload.cjs', contextIsolation: true, sandbox: true, nodeIntegration: false })
})

test('eventos do core e do updater chegam à janela pelo canal mnemo:event', () => {
  nativeCalls.init[0]![1](JSON.stringify({ type: 'graphChanged' }))
  assert.deepEqual(log.sent, [['mnemo:event', { type: 'update', status: 'ready', version: '9.9.9' }], ['mnemo:event', { type: 'graphChanged' }]])
})

test('carrega a página empacotada, ou a URL de desenvolvimento quando definida', async () => {
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(log.loaded, ['file:/app/dist/index.html'])
  process.env.MNEMO_DEV_URL = 'http://localhost:5173'
  try {
    readyCb()
    await new Promise((r) => setImmediate(r))
    assert.equal(log.loaded.at(-1), 'url:http://localhost:5173')
  } finally { delete process.env.MNEMO_DEV_URL }
})

test('comando do core devolve o valor; comando do app não passa pelo core', async () => {
  nativeInvoke = async () => JSON.stringify({ n: 1 })
  assert.deepEqual(await value('graph_page', { path: '/r' }), { n: 1 })
  assert.deepEqual(nativeCalls.invoke, [['graph_page', JSON.stringify({ path: '/r' })]])
  nativeCalls.invoke = []
  await value('update_state')
  assert.deepEqual(nativeCalls.invoke, [])
})

test('erro do core em JSON preserva código, mensagem e campos extras', async () => {
  nativeInvoke = async () => { throw new Error(JSON.stringify({ code: 'gitFailed', message: 'falhou', args: 'pull' })) }
  assert.deepEqual(await errorOf('execute_operation'), { code: 'gitFailed', message: 'falhou', args: 'pull' })
})

test('erro sem código, JSON sem código ou valor que não é Error viram "internal"', async () => {
  nativeInvoke = async () => { throw new Error('quebrou') }
  assert.deepEqual(await errorOf('x'), { code: 'internal', message: 'quebrou' })
  nativeInvoke = async () => { throw new Error('{"message":"sem código"}') }
  assert.deepEqual(await errorOf('x'), { code: 'internal', message: '{"message":"sem código"}' })
  nativeInvoke = async () => { throw 'texto solto' }
  assert.deepEqual(await errorOf('x'), { code: 'internal', message: 'texto solto' })
})

test('pick_folder devolve a pasta escolhida e null ao cancelar', async () => {
  assert.equal(await value('pick_folder'), null)
  openResult = { canceled: false, filePaths: ['/escolhida'] }
  assert.equal(await value('pick_folder'), '/escolhida')
})

test('save_text grava o texto onde o usuário escolheu e devolve o caminho; cancelar não grava', async () => {
  const target = join(root, 'out.md')
  assert.equal(await value('save_text', { name: 'a.md', text: 'oi' }), null)
  saveResult = { canceled: false, filePath: target }
  assert.equal(await value('save_text', { name: 'a.md', text: 'oi' }), target)
  assert.equal(readFileSync(target, 'utf8'), 'oi')
})

test('initial_paths aceita só pastas existentes, sem opções', async () => {
  const argv = process.argv
  process.argv = ['node', 'main', '-x', workdir, join(root, 'nao-existe'), join(workdir, 'a.txt')]
  try { assert.deepEqual(await value('initial_paths'), [workdir]) } finally { process.argv = argv }
})

test('open_file recusa caminho fora do diretório de trabalho', async () => {
  const err = await errorOf('open_file', { workdir, file: '../fora.txt', how: 'default' })
  assert.equal(err.message, 'caminho fora do repositório')
  assert.deepEqual(log.opened, [])
})

test('open_file abre no programa padrão e repassa o erro dele', async () => {
  await value('open_file', { workdir, file: 'a.txt', how: 'default' })
  assert.deepEqual(log.opened, [join(workdir, 'a.txt')])
  openPathError = 'sem programa'
  assert.equal((await errorOf('open_file', { workdir, file: 'a.txt', how: 'default' })).message, 'sem programa')
})

test('open_file mostra na pasta e avisa quando o arquivo não existe mais', async () => {
  await value('open_file', { workdir, file: 'a.txt', how: 'folder' })
  assert.deepEqual(log.shown, [join(workdir, 'a.txt')])
  const err = await errorOf('open_file', { workdir, file: 'sumiu.txt', how: 'folder' })
  assert.match(err.message, /não existe mais no diretório de trabalho: sumiu\.txt/)
})

test('open_file no editor usa VISUAL e cai no programa padrão se o editor sair com erro', async () => {
  process.env.VISUAL = 'meu-editor'
  try {
    await value('open_file', { workdir, file: 'a.txt', how: 'editor' })
    assert.equal(spawned[0]!.editor, 'meu-editor')
    assert.deepEqual(spawned[0]!.args, [join(workdir, 'a.txt')])
    spawned[0]!.child.emit('exit', 0)
    assert.deepEqual(log.opened, [])
    spawned[0]!.child.emit('exit', 127)
    assert.deepEqual(log.opened, [join(workdir, 'a.txt')])
  } finally { delete process.env.VISUAL }
})

test('watch_repository observa o caminho e avisa mudanças; sem caminho, para de observar', async () => {
  await value('watch_repository', { path: '/r' })
  assert.deepEqual(log.watched, ['/r'])
  assert.deepEqual(log.sent.at(-1), ['mnemo:event', { type: 'repoChanged', workdir: '/r' }])
  await value('watch_repository', { path: null })
  assert.equal(log.unwatched, 1)
})

test('comandos de atualização delegam ao updater e devolvem o estado', async () => {
  assert.deepEqual(await value('update_state'), { status: 'available', version: '9.9.9' })
  assert.deepEqual(await value('update_check'), { status: 'available', version: '9.9.9' })
  assert.deepEqual(await value('update_download'), { status: 'available', version: '9.9.9' })
  assert.equal(await value('update_install'), null)
  assert.deepEqual(log.updates, ['check', 'download', 'install'])
})

test('window_action rejeita ação desconhecida', async () => {
  assert.equal((await errorOf('window_action', { action: 'explodir' })).message, 'ação de janela desconhecida: explodir')
})

test('window_action alterna maximizar e tela cheia', async () => {
  await value('window_action', { action: 'toggleMaximize' })
  await value('window_action', { action: 'toggleMaximize' })
  await value('window_action', { action: 'toggleFullScreen' })
  assert.deepEqual(win().calls, ['maximize', 'unmaximize'])
  assert.equal(win().fullScreen, true)
})

test('window_action muda o zoom em passos de 0,5 e restaura em 0', async () => {
  await value('window_action', { action: 'zoomIn' })
  await value('window_action', { action: 'zoomIn' })
  await value('window_action', { action: 'zoomOut' })
  assert.equal(win().zoom, 0.5)
  await value('window_action', { action: 'zoomReset' })
  assert.equal(win().zoom, 0)
})

test('window_action encaminha edição ao campo focado e sai do app em quit/about', async () => {
  for (const action of ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'minimize', 'close']) await value('window_action', { action })
  assert.deepEqual(win().calls, ['undo', 'redo', 'cut', 'copy', 'paste', 'selectAll', 'minimize', 'close'])
  await value('window_action', { action: 'quit' })
  await value('window_action', { action: 'about' })
  assert.equal(log.quit, 1)
  assert.deepEqual(log.shown, ['about'])
})

test('window_action com a janela fechada não faz nada nem falha', async () => {
  const w = win()
  w.handlers.closed!()
  assert.equal(await value('window_action', { action: 'minimize' }), null)
  assert.deepEqual(w.calls, [])
})

test('lembra o tamanho da janela da sessão anterior quando cai em algum monitor', () => {
  writeFileSync(stateFile, JSON.stringify({ bounds: { x: 100, y: 50, width: 800, height: 600 }, maximized: false }))
  readyCb()
  assert.deepEqual([win().opts.x, win().opts.y, win().opts.width, win().opts.height], [100, 50, 800, 600])
  assert.equal(win().maximized, false)
})

test('ignora a posição salva que não cai em nenhum monitor, mantendo o tamanho padrão', () => {
  writeFileSync(stateFile, JSON.stringify({ bounds: { x: 5000, y: 50, width: 800, height: 600 } }))
  readyCb()
  assert.equal(win().opts.x, undefined)
  assert.equal(win().opts.width, 1280)
  assert.equal(win().opts.height, 800)
})

test('reabre maximizada só quando a sessão anterior fechou maximizada', () => {
  writeFileSync(stateFile, JSON.stringify({ bounds: { x: 0, y: 0, width: 800, height: 600 }, maximized: true }))
  readyCb()
  assert.equal(win().maximized, true)
})

test('arquivo de estado corrompido ou com bounds inválidos cai no padrão', () => {
  writeFileSync(stateFile, '{quebrado')
  readyCb()
  assert.equal(win().opts.width, 1280)
  writeFileSync(stateFile, JSON.stringify({ bounds: { x: 'a', y: 0, width: 800, height: 600 } }))
  readyCb()
  assert.equal(win().opts.x, undefined)
})

test('ao fechar grava os limites normais e se está maximizada; minimizada não grava', () => {
  win().maximized = true
  win().handlers.close!()
  assert.deepEqual(JSON.parse(readFileSync(stateFile, 'utf8')), { bounds: { x: 10, y: 20, width: 1000, height: 700 }, maximized: true })
  rmSync(stateFile)
  win().minimized = true
  win().handlers.close!()
  assert.throws(() => readFileSync(stateFile))
})

test('ativar o app sem janelas abre uma nova; com janela aberta não duplica', () => {
  const count = FakeWindow.all.length
  appHandlers.activate!()
  assert.equal(FakeWindow.all.length, count)
  FakeWindow.all = []
  appHandlers.activate!()
  assert.equal(FakeWindow.all.length, 1)
})

test('fechar todas as janelas encerra o app, menos no macOS', () => {
  const platform = process.platform
  try {
    Object.defineProperty(process, 'platform', { value: 'darwin' })
    appHandlers['window-all-closed']!()
    assert.equal(log.quit, 0)
    Object.defineProperty(process, 'platform', { value: 'linux' })
    appHandlers['window-all-closed']!()
    assert.equal(log.quit, 1)
  } finally { Object.defineProperty(process, 'platform', { value: platform }) }
})
