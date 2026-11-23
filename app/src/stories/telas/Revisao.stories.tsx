import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '../../components/App'
import { actions, useApp } from '../../store/app'
import { openRepo, REPO_PATH, reviewState, screen, withReviews } from '../mock/scenario'

const meta = {
  title: 'Telas/Revisão',
  component: App,
  parameters: { layout: 'fullscreen' },
  decorators: [screen],
  beforeEach: async () => {
    withReviews()
    await openRepo()
  },
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

export const RodadaComArquivoAberto: Story = {
  beforeEach: async () => {
    await actions.openReview(REPO_PATH, 'fix/review-comments')
    actions.openReviewFile(REPO_PATH, reviewState().files[0]!)
  },
}

export const ComecandoRevisao: Story = {
  beforeEach: async () => { await actions.requestReview(REPO_PATH, 'feature/storybook') },
}

export const EncerrandoRevisao: Story = {
  beforeEach: async () => {
    await actions.openReview(REPO_PATH, 'fix/review-comments')
    useApp.setState({ reviewEndPrompt: { path: REPO_PATH, branch: 'fix/review-comments' } })
  },
}
