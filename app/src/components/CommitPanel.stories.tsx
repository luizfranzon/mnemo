import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH, selectCommit } from '../stories/mock/scenario'
import { CommitPanel } from './CommitPanel'

const meta = {
  title: 'Componentes/Painéis/CommitPanel',
  component: CommitPanel,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(560, 380)],
  beforeEach: async () => { await openRepo(); selectCommit(0) },
} satisfies Meta<typeof CommitPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Merge: Story = { beforeEach: () => selectCommit(3) }
