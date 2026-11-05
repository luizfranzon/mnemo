import type { Meta, StoryObj } from '@storybook/react-vite'
import tokens from '../../../design-system/tokens.json'

type Token = { $value: string }

function entries(group: Record<string, Token | string>) {
  return Object.entries(group).filter((e): e is [string, Token] => !e[0].startsWith('$'))
}

const meta = { title: 'Fundamentos/Espaço, raio e elevação', parameters: { layout: 'padded' } } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const label = { fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-muted)' } as const

export const Espacamento: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {entries(tokens.espaco).map(([name, { $value }]) => (
        <div key={name} style={{ display: 'grid', gridTemplateColumns: '160px 56px 1fr', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ ...label, color: 'var(--text)' }}>--{name}</span>
          <span style={label}>{$value}</span>
          <div style={{ height: 'var(--space-3)', width: `var(--${name})`, background: 'var(--accent)', borderRadius: 'var(--radius-xs)' }} />
        </div>
      ))}
    </div>
  ),
}

export const Raio: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-4)' }}>
      {entries(tokens.raio).map(([name, { $value }]) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 'var(--space-2)' }}>
          <div style={{ width: 72, height: 72, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: `var(--${name})` }} />
          <span style={{ ...label, color: 'var(--text)' }}>--{name}</span>
          <span style={label}>{$value}</span>
        </div>
      ))}
    </div>
  ),
}

export const Elevacao: Story = {
  render: () => (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 'var(--space-8)', padding: 'var(--space-6)' }}>
      {entries(tokens.elevacao).filter(([name]) => name.startsWith('shadow')).map(([name, { $value }]) => (
        <div key={name} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
          <div style={{ width: 160, height: 96, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-menu)', boxShadow: `var(--${name})` }} />
          <span style={{ ...label, color: 'var(--text)' }}>--{name}</span>
          <span style={label}>{$value}</span>
        </div>
      ))}
    </div>
  ),
}

export const Foco: Story = {
  render: () => (
    <button type="button" style={{ outline: 'var(--focus-ring)', outlineOffset: 2 }}>Botão com anel de foco</button>
  ),
}

export const Alturas: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-2)' }}>
      {entries(tokens.altura).map(([name, { $value }]) => (
        <div key={name} style={{ display: 'grid', gridTemplateColumns: '160px 56px 1fr', alignItems: 'center', gap: 'var(--space-3)' }}>
          <span style={{ ...label, color: 'var(--text)' }}>--{name}</span>
          <span style={label}>{$value}</span>
          <div style={{ height: `var(--${name})`, width: 120, background: 'var(--surface-3)', border: '1px solid var(--border-strong)', borderRadius: 'var(--radius-xs)' }} />
        </div>
      ))}
    </div>
  ),
}
