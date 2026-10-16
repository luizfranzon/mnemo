// Atualização pelo GitHub Releases (electron-updater). Só roda no app empacotado; falhas de rede ficam em silêncio.
import { app } from 'electron'
import { autoUpdater } from 'electron-updater'

export type UpdateState =
  | { status: 'none' }
  | { status: 'available'; version: string }
  | { status: 'downloading'; version: string; percent: number }
  | { status: 'ready'; version: string }

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

let state: UpdateState = { status: 'none' }
let emit: (state: UpdateState) => void = () => {}

function set(next: UpdateState) {
  state = next
  emit(state)
}

export const updateState = () => state

export function checkForUpdate(): Promise<unknown> {
  return app.isPackaged ? autoUpdater.checkForUpdates().catch(() => undefined) : Promise.resolve()
}

export function downloadUpdate() {
  if (state.status !== 'available') return
  set({ status: 'downloading', version: state.version, percent: 0 })
  autoUpdater.downloadUpdate().catch(() => set({ status: 'available', version: (state as { version: string }).version }))
}

export const installUpdate = () => autoUpdater.quitAndInstall()

export function startUpdater(onChange: (state: UpdateState) => void) {
  emit = onChange
  if (!app.isPackaged) return
  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = true // fechar o app sem reiniciar instala na saída
  autoUpdater.allowDowngrade = false // só semver maior que o instalado
  autoUpdater.on('update-available', (info) => set({ status: 'available', version: info.version }))
  autoUpdater.on('download-progress', (p) => {
    if (state.status === 'downloading') set({ ...state, percent: Math.round(p.percent) })
  })
  autoUpdater.on('update-downloaded', (info) => set({ status: 'ready', version: info.version }))
  autoUpdater.on('error', () => {
    if (state.status === 'downloading') set({ status: 'available', version: state.version })
  })
  void checkForUpdate()
  setInterval(() => { if (state.status === 'none' || state.status === 'available') void checkForUpdate() }, CHECK_EVERY_MS).unref()
}
