import type { Meta, StoryObj } from '@storybook/react-vite'
import { manyWip, mixedWip } from '../stories/mock/fixtures'
import { forever, frame, mockBackend, openRepo, REPO_PATH, withConflicts, wipStatus } from '../stories/mock/scenario'
import { WipPanel } from './WipPanel'

const meta = {
  title: 'Componentes/Painéis/WipPanel',
  component: WipPanel,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(620, 380)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof WipPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const SemMudancas: Story = {
  beforeEach: () => mockBackend({ wip_status: () => ({ unstaged: [], staged: [] }) }),
}

export const Carregando: Story = { beforeEach: () => mockBackend({ wip_status: forever }) }

export const SoPreparadas: Story = { beforeEach: () => mockBackend({ wip_status: () => ({ unstaged: [], staged: wipStatus.staged }) }) }

export const SoNaoPreparadas: Story = { beforeEach: () => mockBackend({ wip_status: () => ({ unstaged: wipStatus.unstaged, staged: [] }) }) }

export const MuitosArquivos: Story = { beforeEach: () => mockBackend({ wip_status: () => manyWip(240, 60) }) }

export const TiposDeMudanca: Story = {
  beforeEach: () => mockBackend({ wip_status: () => mixedWip }),
  parameters: { docs: { description: { story: 'Deletado, renomeado, binário e caminho muito longo.' } } },
}

export const ComConflitos: Story = { beforeEach: () => withConflicts() }
