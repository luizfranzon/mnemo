import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo } from '../stories/mock/scenario'
import { TitleBar } from './TitleBar'

const meta = {
  title: 'Componentes/Navegação/TitleBar',
  component: TitleBar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
} satisfies Meta<typeof TitleBar>

export default meta
type Story = StoryObj<typeof meta>

export const SemRepositorio: Story = {}

export const ComRepositorio: Story = { beforeEach: async () => { await openRepo() } }
