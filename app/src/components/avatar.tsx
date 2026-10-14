import { useEffect, useState } from 'react'

export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase()).join('') || '?'
const hue = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
/** Cores do avatar de iniciais, estáveis por e-mail. */
export const avatarStyle = (email: string) => ({ background: `hsl(${hue(email)} 35% 22%)`, color: `hsl(${hue(email)} 70% 72%)` })

/** Hash SHA-256 do email normalizado, como o Gravatar espera. */
export async function gravatarHash(email: string) {
  const bytes = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(email.trim().toLowerCase()))
  return [...new Uint8Array(bytes)].map((b) => b.toString(16).padStart(2, '0')).join('')
}

const hashes = new Map<string, string>()
/** Emails sem Gravatar (404) ou que falharam offline: não tenta de novo nesta sessão. */
const missing = new Set<string>()

/** URL do Gravatar do email, ou null enquanto calcula o hash e quando não há foto (aí ficam as iniciais). */
export function useGravatar(email: string) {
  const key = email.trim().toLowerCase()
  const [, rerender] = useState(0)
  useEffect(() => {
    if (!key || hashes.has(key)) return
    void gravatarHash(key).then((h) => { hashes.set(key, h); rerender((n) => n + 1) })
  }, [key])
  const hash = hashes.get(key)
  return {
    url: hash && !missing.has(key) ? `https://www.gravatar.com/avatar/${hash}?s=64&d=404` : null,
    fail: () => { missing.add(key); rerender((n) => n + 1) },
  }
}

/** Foto do Gravatar sobre o círculo de iniciais; `checked` troca tudo por um ✓ em fundo azul. */
export function Avatar({ name, email, small, checked }: { name: string; email: string; small?: boolean; checked?: boolean }) {
  const photo = useGravatar(email)
  if (checked) return <span className={`avatar checked${small ? ' small' : ''}`} aria-hidden="true">✓</span>
  return <span className={`avatar${small ? ' small' : ''}`} style={avatarStyle(email)} aria-hidden="true">
    {initials(name)}{photo.url && <img src={photo.url} alt="" onError={photo.fail} />}
  </span>
}
