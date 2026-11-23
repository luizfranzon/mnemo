import type { Meta, StoryObj } from '@storybook/react-vite'
import { mockBackend, frame, openCommitDiff, openRepo, openWipDiff, REPO_PATH } from '../stories/mock/scenario'
import { DiffView } from './DiffView'

const meta = {
  title: 'Componentes/Diff e Conflito/DiffView',
  component: DiffView,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(520)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof DiffView>

export default meta
type Story = StoryObj<typeof meta>

export const DeCommit: Story = { beforeEach: () => openCommitDiff() }

export const MudancaNaoPreparada: Story = { beforeEach: () => openWipDiff(false) }

export const MudancaPreparada: Story = { beforeEach: () => openWipDiff(true) }

export const Binario: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => ({ path: String(args.file), oldPath: null, binary: true, tooLarge: false, encoding: 'binary', encodingId: 'binary', guessed: false, stageable: false, added: 0, removed: 0, hunks: [], lines: [] }) })
    openWipDiff(false)
  },
}

export const GrandeDemais: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => ({ path: String(args.file), oldPath: null, binary: false, tooLarge: true, encoding: 'UTF-8', encodingId: 'utf-8', guessed: true, stageable: false, added: 0, removed: 0, hunks: [], lines: [] }) })
    openWipDiff(false)
  },
}
