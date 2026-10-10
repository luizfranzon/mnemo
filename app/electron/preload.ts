import { contextBridge, ipcRenderer } from 'electron'

type Envelope = { ok: true; value: unknown } | { ok: false; error: { code: string; message: string } }

/** Superfície mínima exposta à UI: o formato do `@tauri-apps/api` (invoke/listen). */
contextBridge.exposeInMainWorld('__mnemo', {
  async invoke(cmd: string, args: Record<string, unknown>) {
    const r = (await ipcRenderer.invoke('mnemo:invoke', cmd, args)) as Envelope
    if (r.ok) return r.value
    throw r.error
  },
  listen(event: string, cb: (payload: unknown) => void) {
    const channel = event === 'menu' ? 'mnemo:menu' : 'mnemo:event'
    const handler = (_e: unknown, payload: unknown) => cb(payload)
    ipcRenderer.on(channel, handler)
    return () => ipcRenderer.removeListener(channel, handler)
  },
})
