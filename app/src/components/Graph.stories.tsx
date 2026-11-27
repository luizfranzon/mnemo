import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { emptyGraph, manyCommits, singleCommit } from '../stories/mock/fixtures'
import { forever, frame, mockBackend, openRepo, REPO_PATH, selectCommit } from '../stories/mock/scenario'
import type { GraphPage } from '../bridge/types'
import { Graph } from './Graph'

const meta = {
  title: 'Componentes/Painéis/Graph',
  component: Graph,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(520)],
} satisfies Meta<typeof Graph>

export default meta
type Story = StoryObj<typeof meta>

const withPage = (page: () => GraphPage | Promise<GraphPage>) => async () => {
  mockBackend({ graph_page: page })
  await openRepo()
}

export const Padrao: Story = { beforeEach: async () => { await openRepo() } }

export const CommitSelecionado: Story = { beforeEach: async () => { await openRepo(); selectCommit(3) } }

export const WipSelecionado: Story = { beforeEach: async () => { await openRepo(); actions.selectCommit(REPO_PATH, 'wip') } }

export const Carregando: Story = { beforeEach: withPage(forever) }

export const SemCommits: Story = { beforeEach: withPage(emptyGraph) }

export const UmCommit: Story = { beforeEach: withPage(singleCommit) }

export const SemMudancasLocais: Story = { beforeEach: withPage(() => ({ ...manyCommits(6), wip: { changed: 0, untracked: 0 } })) }

export const MuitosCommits: Story = {
  beforeEach: withPage(() => manyCommits(5000)),
  parameters: { docs: { description: { story: '5000 commits, textos longos a cada 7 linhas. A lista é virtualizada.' } } },
}
