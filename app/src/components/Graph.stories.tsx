import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openRepo, REPO_PATH, selectCommit } from '../stories/mock/scenario'
import { Graph } from './Graph'

const meta = {
  title: 'Componentes/Painéis/Graph',
  component: Graph,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(520)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof Graph>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const CommitSelecionado: Story = { beforeEach: () => selectCommit(3) }

export const WipSelecionado: Story = { beforeEach: () => actions.selectCommit(REPO_PATH, 'wip') }
