import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { manyFiles } from '../stories/mock/fixtures'
import { frame, mockBackend, openRepo, REPO_PATH, reviewState, withReviews } from '../stories/mock/scenario'
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

export const SemArquivos: Story = {
  beforeEach: () => mockBackend({ review_open: () => ({ ...reviewState(), files: [] }) }),
}

export const TudoRevisado: Story = {
  beforeEach: () => mockBackend({ review_open: () => {
    const state = reviewState()
    const round = state.review.rounds[0]!
    return { ...state, review: { ...state.review, rounds: [{ ...round, reviewed: state.files.map((f) => f.path) }] } }
  } }),
}

export const MuitosArquivos: Story = {
  beforeEach: () => mockBackend({ review_open: () => ({ ...reviewState(), files: manyFiles(180).map((f) => ({ ...f, reverted: false })) }) }),
}

export const RodadaConcluida: Story = {
  beforeEach: () => mockBackend({ review_open: () => reviewState(true) }),
}

export const BranchReescrita: Story = {
  beforeEach: () => mockBackend({ review_open: () => ({ ...reviewState(), status: { tip: reviewState().status.tip, ahead: 3, rewritten: true, merged: false } }) }),
  parameters: { docs: { description: { story: 'A branch foi reescrita depois da rodada começar.' } } },
}

export const BranchJaMergeada: Story = {
  beforeEach: () => mockBackend({ review_open: () => ({ ...reviewState(), status: { tip: reviewState().status.tip, ahead: 0, rewritten: false, merged: true } }) }),
}
