import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { PushRejectedBar } from './PushRejectedBar'

const meta = {
  title: 'Componentes/Feedback/PushRejectedBar',
  component: PushRejectedBar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
  beforeEach: async () => {
    await openRepo()
    useApp.setState({ pushRejected: { path: REPO_PATH, branch: 'feature/storybook', upstream: 'origin/feature/storybook' } })
  },
} satisfies Meta<typeof PushRejectedBar>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
