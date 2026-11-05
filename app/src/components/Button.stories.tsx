import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button, IconButton, type ButtonSize, type ButtonVariant } from './Button'

const VARIANTS: ButtonVariant[] = ['primary', 'secondary', 'ghost', 'success', 'danger', 'danger-solid', 'ai']
const SIZES: ButtonSize[] = ['sm', 'md', 'lg']

const meta = {
  title: 'Primitivos/Button',
  component: Button,
  args: { children: 'Cancelar', variant: 'secondary', size: 'md' },
  argTypes: {
    variant: { control: 'select', options: VARIANTS },
    size: { control: 'inline-radio', options: SIZES },
  },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Variantes: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      {VARIANTS.map((v) => <Button key={v} {...args} variant={v}>{v}</Button>)}
    </div>
  ),
}

export const Tamanhos: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
      {SIZES.map((s) => <Button key={s} {...args} size={s}>{s}</Button>)}
    </div>
  ),
}

export const Desabilitado: Story = {
  render: (args) => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', flexWrap: 'wrap' }}>
      {VARIANTS.map((v) => <Button key={v} {...args} variant={v} disabled>{v}</Button>)}
    </div>
  ),
}

export const Ocupado: Story = { args: { variant: 'success', size: 'lg', 'aria-busy': true, disabled: true, children: 'Commitando…' } }

export const SoIcone: Story = {
  render: () => (
    <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center' }}>
      {SIZES.map((s) => <IconButton key={s} size={s} label="Fechar" icon="close" />)}
      <IconButton label="Descartar" icon="trash" variant="danger" />
      <IconButton label="Copiar SHA" icon="copy" variant="secondary" />
      <IconButton label="Indisponível" icon="refresh" disabled />
    </div>
  ),
}
