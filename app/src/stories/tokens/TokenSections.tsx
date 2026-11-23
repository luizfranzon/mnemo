import type { CSSProperties, ReactNode } from 'react'
import tokensCss from '../../../design-system/tokens.css?raw'

interface Token { name: string; value: string }
interface Group { title: string; tokens: Token[] }

const rootBlock = tokensCss.slice(tokensCss.indexOf(':root'), tokensCss.indexOf('\n}\n'))

function parseGroups(): Group[] {
  const groups: Group[] = []
  for (const raw of rootBlock.split('\n')) {
    const line = raw.trim()
    const heading = /^\/\*\s*(.+?)\s*\*\/$/.exec(line)
    if (heading) { groups.push({ title: heading[1]!, tokens: [] }); continue }
    const declaration = /^(--[\w-]+):\s*(.+?);(?:\s*\/\*.*\*\/)?$/.exec(line)
    if (declaration) groups.at(-1)?.tokens.push({ name: declaration[1]!, value: declaration[2]! })
  }
  return groups
}

const ALL = parseGroups()
const groupsStartingWith = (...titles: string[]) => ALL.filter((g) => titles.some((t) => g.title.startsWith(t)))

const page: CSSProperties = { display: 'flex', flexDirection: 'column', gap: 'var(--space-6)', color: 'var(--text)', fontFamily: 'var(--font-ui)' }
const heading: CSSProperties = { margin: 0, fontSize: 'var(--fs-overline)', letterSpacing: '.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }
const code: CSSProperties = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-code)' }

function Section({ title, children }: { title: string; children: ReactNode }) {
  return <section style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}><h3 style={heading}>{title}</h3>{children}</section>
}

function Meta({ token }: { token: Token }) {
  return <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
    <span style={code}>{token.name}</span>
    <span style={{ ...code, color: 'var(--text-subtle)', overflow: 'hidden', textOverflow: 'ellipsis' }}>{token.value}</span>
  </div>
}

function Swatches({ groups }: { groups: Group[] }) {
  return <div style={page}>
    {groups.map((group) => <Section key={group.title} title={group.title}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 'var(--space-3)' }}>
        {group.tokens.map((token) => <div key={token.name} style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
          <span aria-hidden="true" style={{ width: 40, height: 40, flex: 'none', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-strong)', background: `var(${token.name})` }} />
          <Meta token={token} />
        </div>)}
      </div>
    </Section>)}
  </div>
}

export const Colors = () => <Swatches groups={groupsStartingWith('Superfícies', 'Bordas', 'Texto', 'Accent', 'Warning', 'Success', 'Danger', 'IA', 'Diff', 'Lanes', 'Syntax')} />

export function Typography() {
  const sizes = groupsStartingWith('Tipografia')[0]?.tokens.filter((t) => t.name.startsWith('--fs-')) ?? []
  const fonts = groupsStartingWith('Tipografia')[0]?.tokens.filter((t) => t.name.startsWith('--font-')) ?? []
  return <div style={page}>
    <Section title="Famílias">
      {fonts.map((font) => <div key={font.name} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span style={{ fontFamily: `var(${font.name})`, fontSize: 'var(--fs-title-1)' }}>Aa Bb Cc 0123456789</span><Meta token={font} />
      </div>)}
    </Section>
    <Section title="Escala">
      {sizes.map((size) => <div key={size.name} style={{ display: 'flex', alignItems: 'baseline', gap: 'var(--space-4)' }}>
        <span style={{ width: 280, fontSize: `var(${size.name})`, whiteSpace: 'nowrap' }}>Histórico de commits</span><Meta token={size} />
      </div>)}
    </Section>
  </div>
}

export function Spacing() {
  const [group] = groupsStartingWith('Espaço')
  return <div style={page}><Section title={group?.title ?? 'Espaço'}>
    {group?.tokens.map((token) => <div key={token.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
      <span style={{ width: 140, ...code }}>{token.name}</span>
      <span aria-hidden="true" style={{ display: 'block', height: 16, width: `var(${token.name})`, background: 'var(--accent)', borderRadius: 2 }} />
      <span style={{ ...code, color: 'var(--text-subtle)' }}>{token.value}</span>
    </div>)}
  </Section></div>
}

export function Radii() {
  const [group] = groupsStartingWith('Raio')
  return <div style={page}><Section title={group?.title ?? 'Raio'}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-6)' }}>
      {group?.tokens.map((token) => <div key={token.name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)', alignItems: 'center' }}>
        <span aria-hidden="true" style={{ width: 88, height: 56, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: `var(${token.name})` }} />
        <Meta token={token} />
      </div>)}
    </div>
  </Section></div>
}

export function Elevation() {
  const [group] = groupsStartingWith('Elevação')
  const shadows = group?.tokens.filter((t) => t.name.startsWith('--shadow-')) ?? []
  return <div style={page}><Section title={group?.title ?? 'Elevação'}>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)' }}>
      {shadows.map((token) => <div key={token.name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <span aria-hidden="true" style={{ width: 160, height: 96, background: 'var(--surface-3)', borderRadius: 'var(--radius-menu)', boxShadow: `var(${token.name})` }} />
        <Meta token={token} />
      </div>)}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-3)' }}>
        <button style={{ width: 160, height: 40, background: 'var(--control)', color: 'var(--text)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-sm)', outline: 'var(--focus-ring)', outlineOffset: 2 }}>Botão</button>
        <Meta token={{ name: '--focus-ring', value: 'var(--focus-ring)' }} />
      </div>
    </div>
  </Section></div>
}

export function Heights() {
  const [group] = groupsStartingWith('Alturas')
  return <div style={page}><Section title={group?.title ?? 'Alturas'}>
    {group?.tokens.map((token) => <div key={token.name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-4)' }}>
      <span style={{ width: 140, ...code }}>{token.name}</span>
      <span aria-hidden="true" style={{ display: 'block', width: 120, height: `var(${token.name})`, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 2 }} />
      <span style={{ ...code, color: 'var(--text-subtle)' }}>{token.value}</span>
    </div>)}
  </Section></div>
}
