import { beforeEach, mock, test, type TestContext } from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'

const app = { isPackaged: true }
class FakeUpdater extends EventEmitter {
  autoDownload = true
  autoInstallOnAppQuit = false
  allowDowngrade = true
  checks = 0
  installs = 0
  checkResult: () => Promise<unknown> = async () => undefined
  downloadResult: () => Promise<unknown> = async () => undefined
  checkForUpdates() { this.checks++; return this.checkResult() }
  downloadUpdate() { return this.downloadResult() }
  quitAndInstall() { this.installs++ }
}
let autoUpdater = new FakeUpdater()

mock.module('electron', { exports: { app } })
mock.module('electron-updater', { exports: { get autoUpdater() { return autoUpdater } } })

type Updater = typeof import('./updater')
let seq = 0
const load = (): Promise<Updater> => import(`./updater.ts?t=${++seq}`)

const CHECK_EVERY_MS = 4 * 60 * 60 * 1000

beforeEach(() => {
  app.isPackaged = true
  autoUpdater = new FakeUpdater()
})

async function started(t: TestContext) {
  t.mock.timers.enable({ apis: ['setInterval'] })
  const u = await load()
  const states: unknown[] = []
  u.startUpdater((s) => states.push(s))
  return { u, states }
}

test('fora do app empacotado não registra eventos nem checa atualização', async (t) => {
  app.isPackaged = false
  const { u } = await started(t)
  await u.checkForUpdate()
  assert.equal(autoUpdater.checks, 0)
  assert.equal(autoUpdater.listenerCount('update-available'), 0)
  assert.deepEqual(u.updateState(), { status: 'none' })
})

test('empacotado configura o download manual, sem downgrade, e checa ao iniciar', async (t) => {
  await started(t)
  assert.equal(autoUpdater.autoDownload, false)
  assert.equal(autoUpdater.allowDowngrade, false)
  assert.equal(autoUpdater.autoInstallOnAppQuit, true)
  assert.equal(autoUpdater.checks, 1)
})

test('versão nova vira "available" e avisa quem escuta', async (t) => {
  const { u, states } = await started(t)
  autoUpdater.emit('update-available', { version: '1.2.0' })
  assert.deepEqual(u.updateState(), { status: 'available', version: '1.2.0' })
  assert.deepEqual(states, [{ status: 'available', version: '1.2.0' }])
})

test('baixar só funciona com atualização disponível', async (t) => {
  const { u } = await started(t)
  let downloads = 0
  autoUpdater.downloadResult = async () => { downloads++ }
  u.downloadUpdate()
  assert.equal(downloads, 0)
  assert.deepEqual(u.updateState(), { status: 'none' })
})

test('baixar passa a "downloading" com 0% e pede o download', async (t) => {
  const { u } = await started(t)
  let downloads = 0
  autoUpdater.downloadResult = async () => { downloads++ }
  autoUpdater.emit('update-available', { version: '1.2.0' })
  u.downloadUpdate()
  assert.equal(downloads, 1)
  assert.deepEqual(u.updateState(), { status: 'downloading', version: '1.2.0', percent: 0 })
})

test('progresso arredonda o percentual só durante o download', async (t) => {
  const { u } = await started(t)
  autoUpdater.emit('download-progress', { percent: 40 })
  assert.deepEqual(u.updateState(), { status: 'none' })
  autoUpdater.emit('update-available', { version: '1.2.0' })
  u.downloadUpdate()
  autoUpdater.emit('download-progress', { percent: 41.6 })
  assert.deepEqual(u.updateState(), { status: 'downloading', version: '1.2.0', percent: 42 })
})

test('download concluído vira "ready"', async (t) => {
  const { u } = await started(t)
  autoUpdater.emit('update-downloaded', { version: '1.2.0' })
  assert.deepEqual(u.updateState(), { status: 'ready', version: '1.2.0' })
})

test('download que falha volta a "available" para tentar de novo', async (t) => {
  const { u } = await started(t)
  autoUpdater.downloadResult = async () => { throw new Error('rede') }
  autoUpdater.emit('update-available', { version: '1.2.0' })
  u.downloadUpdate()
  await new Promise((r) => setImmediate(r))
  assert.deepEqual(u.updateState(), { status: 'available', version: '1.2.0' })
})

test('erro do updater durante o download volta a "available"; fora dele não muda nada', async (t) => {
  const { u } = await started(t)
  autoUpdater.emit('error', new Error('x'))
  assert.deepEqual(u.updateState(), { status: 'none' })
  autoUpdater.emit('update-available', { version: '1.2.0' })
  u.downloadUpdate()
  autoUpdater.emit('error', new Error('x'))
  assert.deepEqual(u.updateState(), { status: 'available', version: '1.2.0' })
  autoUpdater.emit('update-downloaded', { version: '1.2.0' })
  autoUpdater.emit('error', new Error('x'))
  assert.deepEqual(u.updateState(), { status: 'ready', version: '1.2.0' })
})

test('falha de rede ao checar fica em silêncio', async (t) => {
  const { u } = await started(t)
  autoUpdater.checkResult = async () => { throw new Error('offline') }
  await assert.doesNotReject(u.checkForUpdate())
})

test('instalar fecha o app e instala', async (t) => {
  const { u } = await started(t)
  u.installUpdate()
  assert.equal(autoUpdater.installs, 1)
})

test('a cada 4 horas checa de novo, exceto durante o download ou com atualização pronta', async (t) => {
  const { u } = await started(t)
  assert.equal(autoUpdater.checks, 1)
  t.mock.timers.tick(CHECK_EVERY_MS)
  assert.equal(autoUpdater.checks, 2)
  autoUpdater.emit('update-available', { version: '1.2.0' })
  t.mock.timers.tick(CHECK_EVERY_MS)
  assert.equal(autoUpdater.checks, 3)
  u.downloadUpdate()
  t.mock.timers.tick(CHECK_EVERY_MS)
  assert.equal(autoUpdater.checks, 3)
  autoUpdater.emit('update-downloaded', { version: '1.2.0' })
  t.mock.timers.tick(CHECK_EVERY_MS)
  assert.equal(autoUpdater.checks, 3)
})
