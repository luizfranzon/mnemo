import type { Meta, StoryObj } from '@storybook/react-vite'
import { IconButton } from './IconButton'

const meta = {
  title: 'Componentes/Base/IconButton',
  component: IconButton,
  args: { icon: 'more', label: 'Mais ações' },
} satisfies Meta<typeof IconButton>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Desabilitado: Story = { args: { disabled: true } }

export const Fechar: Story = { args: { icon: 'close', label: 'Fechar' } }
