import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo } from '../stories/mock/scenario'
import { Palette } from './Palette'

const meta = {
  title: 'Componentes/Diálogos/Palette',
  component: Palette,
  args: { mode: 'checkout' },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof Palette>

export default meta
type Story = StoryObj<typeof meta>

export const Checkout: Story = {}

export const CriarBranch: Story = { args: { mode: 'createBranch' } }
