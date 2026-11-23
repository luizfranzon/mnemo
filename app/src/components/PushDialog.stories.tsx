import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { PushDialog } from './PushDialog'

const meta = {
  title: 'Componentes/Diálogos/PushDialog',
  component: PushDialog,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(360)],
  beforeEach: async () => {
    await openRepo()
    useApp.setState({ pushPrompt: { path: REPO_PATH, branch: 'feature/nova', remotes: ['origin', 'upstream'] } })
  },
} satisfies Meta<typeof PushDialog>

export default meta
type Story = StoryObj<typeof meta>

export const EscolherRemoto: Story = {}
