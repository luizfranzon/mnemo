import type { Meta, StoryObj } from '@storybook/react-vite'
import { Icon, ICONS, type IconName } from './Icon'

const meta = {
  title: 'Componentes/Base/Icon',
  component: Icon,
  args: { name: 'branch', size: 15, strokeWidth: 1.8, spin: false },
  argTypes: { name: { control: 'select', options: Object.keys(ICONS) } },
} satisfies Meta<typeof Icon>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Girando: Story = { args: { name: 'refresh', spin: true } }

export const Galeria: Story = {
  render: () => <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 'var(--space-4)' }}>
    {(Object.keys(ICONS) as IconName[]).map((name) => <div key={name} style={{ display: 'flex', alignItems: 'center', gap: 'var(--space-2)' }}>
      <Icon name={name} size={18} /><span style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--fs-code)', color: 'var(--text-muted)' }}>{name}</span>
    </div>)}
  </div>,
}
