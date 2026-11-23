import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame } from '../stories/mock/scenario'
import { GitMissing } from './GitMissing'

const meta = {
  title: 'Componentes/Feedback/GitMissing',
  component: GitMissing,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(360)],
} satisfies Meta<typeof GitMissing>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
