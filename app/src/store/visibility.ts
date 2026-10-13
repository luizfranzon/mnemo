// Visibilidade no grafo (docs/01-features.md § 3–4): Ocultar, Solo, Fixar e visibilidade inteligente.
// Fica nos dados do app por diretório de trabalho (ADR 0005). Os nomes são refs completas (`refs/heads/x`).
import { create } from 'zustand'

export interface Visibility { hidden: string[]; solo: string | null; pinned: string[]; smart: boolean }

export const EMPTY: Visibility = { hidden: [], solo: null, pinned: [], smart: false }
const key = (path: string) => `mnemo.visibility:${path}`

export const localRef = (name: string) => `refs/heads/${name}`
export const remoteRef = (remote: string, name: string) => `refs/remotes/${remote}/${name}`

const strings = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [])

export function sanitize(raw: Partial<Visibility>): Visibility {
  return { hidden: strings(raw.hidden), solo: typeof raw.solo === 'string' ? raw.solo : null, pinned: strings(raw.pinned), smart: raw.smart === true }
}

const flip = (list: string[], ref: string) => (list.includes(ref) ? list.filter((r) => r !== ref) : [...list, ref])

/** Ocultar e Solo se excluem: o Solo mostra só uma branch, então ocultá-la não faz sentido. */
export const toggleHidden = (v: Visibility, ref: string): Visibility => ({ ...v, hidden: flip(v.hidden, ref), solo: v.solo === ref ? null : v.solo })
export const toggleSolo = (v: Visibility, ref: string): Visibility => ({ ...v, solo: v.solo === ref ? null : ref, hidden: v.hidden.filter((r) => r !== ref) })
export const togglePinned = (v: Visibility, ref: string): Visibility => ({ ...v, pinned: flip(v.pinned, ref) })

/** O que o core precisa para recalcular as lanes (Fixar é só da UI). */
export const graphVisibility = (v: Visibility) => ({ hidden: v.hidden, solo: v.solo, smart: v.smart })

const cache = new Map<string, Visibility>()
/** Memoizado por caminho: o seletor do Zustand precisa devolver sempre a mesma referência. */
function load(path: string): Visibility {
  let v = cache.get(path)
  if (!v) {
    try { v = sanitize(JSON.parse(localStorage.getItem(key(path)) ?? '{}') as Partial<Visibility>) } catch { v = EMPTY }
    cache.set(path, v)
  }
  return v
}

export const useVisibility = create<{ byPath: Record<string, Visibility> }>(() => ({ byPath: {} }))

export const selectVisibility = (path: string) => (s: { byPath: Record<string, Visibility> }) => s.byPath[path] ?? load(path)

export function updateVisibility(path: string, fn: (v: Visibility) => Visibility) {
  const next = fn(useVisibility.getState().byPath[path] ?? load(path))
  cache.set(path, next)
  try { localStorage.setItem(key(path), JSON.stringify(next)) } catch { /* sem armazenamento: vale só nesta sessão */ }
  useVisibility.setState((s) => ({ byPath: { ...s.byPath, [path]: next } }))
}
