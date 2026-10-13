export const initials = (name: string) => name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]!.toLocaleUpperCase()).join('') || '?'
const hue = (text: string) => [...text].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7)
/** Cores do avatar de iniciais, estáveis por e-mail. */
export const avatarStyle = (email: string) => ({ background: `hsl(${hue(email)} 35% 22%)`, color: `hsl(${hue(email)} 70% 72%)` })
