import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { ReviewDialogs } from './ReviewDialogs'

const meta = {
  title: 'Componentes/Revisão/ReviewDialogs',
  component: ReviewDialogs,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof ReviewDialogs>

export default meta
type Story = StoryObj<typeof meta>

export const ComecarRevisao: Story = {
  beforeEach: () => { useApp.setState({ reviewPrompt: { path: REPO_PATH, branch: 'fix/review-comments', base: 'main', round: 1 } }) },
}

export const ProximaRodada: Story = {
  beforeEach: () => { useApp.setState({ reviewPrompt: { path: REPO_PATH, branch: 'fix/review-comments', base: 'main', round: 2 } }) },
}

export const EncerrarRevisao: Story = {
  beforeEach: () => { useApp.setState({ reviewEndPrompt: { path: REPO_PATH, branch: 'fix/review-comments' } }) },
}
