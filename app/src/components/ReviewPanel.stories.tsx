import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openRepo, REPO_PATH, withReviews } from '../stories/mock/scenario'
import { ReviewPanel } from './ReviewPanel'

const meta = {
  title: 'Componentes/Revisão/ReviewPanel',
  component: ReviewPanel,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(560, 380)],
  beforeEach: async () => {
    withReviews()
    await openRepo()
    await actions.openReview(REPO_PATH, 'fix/review-comments')
  },
} satisfies Meta<typeof ReviewPanel>

export default meta
type Story = StoryObj<typeof meta>

export const RodadaAberta: Story = {}
