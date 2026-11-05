import type { Meta, StoryObj } from '@storybook/react-vite'
import type { CSSProperties } from 'react'

type Style = { name: string; token: string; weight: number; extra?: CSSProperties; mono?: boolean; sample: string }

const STYLES: Style[] = [
  { name: 'display', token: '--fs-display', weight: 600, extra: { letterSpacing: '-0.015em' }, sample: 'Histórico de commits' },
  { name: 'title-1', token: '--fs-title-1', weight: 600, sample: 'Título de tela' },
  { name: 'title-2', token: '--fs-title-2', weight: 600, sample: 'Título de diálogo' },
  { name: 'body', token: '--fs-body', weight: 400, extra: { lineHeight: 1.5 }, sample: 'Texto corrido para descrições e mensagens longas.' },
  { name: 'body-sm', token: '--fs-body-sm', weight: 400, sample: 'Listas, menus e botões' },
  { name: 'caption', token: '--fs-caption', weight: 400, extra: { color: 'var(--text-muted)' }, sample: 'Metadados e texto de apoio' },
  { name: 'overline', token: '--fs-overline', weight: 600, extra: { letterSpacing: '0.06em', textTransform: 'uppercase' }, sample: 'Preparados' },
  { name: 'code', token: '--fs-code', weight: 400, mono: true, sample: 'a3f9c21 feature/design-system' },
]

function Scale() {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)', width: 720 }}>
      {STYLES.map((s) => (
        <div key={s.name} style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', gap: 'var(--space-4)', paddingBottom: 'var(--space-3)', borderBottom: '1px solid var(--border-subtle)' }}>
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-caption)', color: 'var(--text-subtle)' }}>
            <div style={{ color: 'var(--text)' }}>{s.name}</div>
            <div>{s.token}</div>
          </div>
          <div style={{ fontFamily: s.mono ? 'var(--font-mono)' : 'var(--font-ui)', fontSize: `var(${s.token})`, fontWeight: s.weight, color: 'var(--text)', ...s.extra }}>{s.sample}</div>
        </div>
      ))}
    </div>
  )
}

const meta = { title: 'Fundamentos/Tipografia', parameters: { layout: 'padded' } } satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Escala: Story = { render: () => <Scale /> }

export const Familias: Story = {
  render: () => (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--space-4)' }}>
      <div style={{ fontFamily: 'var(--font-ui)', fontSize: 'var(--fs-title-1)', color: 'var(--text)' }}>IBM Plex Sans: interface</div>
      <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-title-2)', color: 'var(--text)' }}>JetBrains Mono: código, SHA, branch, caminhos, números</div>
    </div>
  ),
}
