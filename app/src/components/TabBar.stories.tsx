import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openTwoRepos, REPO_PATH, withReviews } from '../stories/mock/scenario'
import { TabBar } from './TabBar'

const meta = {
  title: 'Componentes/Navegação/TabBar',
  component: TabBar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
} satisfies Meta<typeof TabBar>

export default meta
type Story = StoryObj<typeof meta>

export const SemAbas: Story = {}

export const DuasAbas: Story = { beforeEach: async () => { await openTwoRepos() } }

export const AbaEmRevisao: Story = {
  beforeEach: async () => {
    withReviews()
    await openTwoRepos()
    await actions.openReview(REPO_PATH, 'fix/review-comments')
  },
}
