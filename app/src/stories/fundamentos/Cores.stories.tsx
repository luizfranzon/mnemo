import type { Meta, StoryObj } from '@storybook/react-vite'
import tokens from '../../../design-system/tokens.json'

type Token = { $value: string }
type Group = Record<string, Token | string>

function Swatches({ group }: { group: Group }) {
  const entries = Object.entries(group).filter((e): e is [string, Token] => !e[0].startsWith('$'))
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 'var(--space-3)', width: 720 }}>
      {entries.map(([name, { $value }]) => (
        <div key={name} style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 'var(--radius-md)', overflow: 'hidden' }}>
          <div style={{ height: 40, background: `var(--${name})` }} />
          <div style={{ padding: 'var(--space-2)', fontSize: 'var(--fs-caption)' }}>
            <div style={{ color: 'var(--text)', fontFamily: 'var(--font-mono)' }}>--{name}</div>
            <div style={{ color: 'var(--text-muted)', fontFamily: 'var(--font-mono)' }}>{$value}</div>
          </div>
        </div>
      ))}
    </div>
  )
}

const meta = {
  title: 'Fundamentos/Cores',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Superficies: Story = { render: () => <Swatches group={tokens.superficie} /> }
export const Bordas: Story = { render: () => <Swatches group={tokens.borda} /> }
export const Texto: Story = { render: () => <Swatches group={tokens.texto} /> }
export const Accent: Story = { render: () => <Swatches group={tokens.accent} /> }
export const Warning: Story = { render: () => <Swatches group={tokens.warning} /> }
export const Success: Story = { render: () => <Swatches group={tokens.success} /> }
export const Danger: Story = { render: () => <Swatches group={tokens.danger} /> }
export const IA: Story = { render: () => <Swatches group={tokens.ia} /> }
export const Info: Story = { render: () => <Swatches group={tokens.info} /> }
export const DiffEConflito: Story = { render: () => <Swatches group={tokens.diff} /> }
export const PillDeRef: Story = { render: () => <Swatches group={tokens.ref} /> }
export const LanesDoGrafo: Story = { render: () => <Swatches group={tokens.lane} /> }
export const Syntax: Story = { render: () => <Swatches group={tokens.syntax} /> }
