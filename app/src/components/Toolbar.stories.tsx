import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { undoEmpty } from '../stories/mock/fixtures'
import { frame, openRepo, patchTabs, REPO_PATH } from '../stories/mock/scenario'
import { Toolbar } from './Toolbar'

const meta = {
  title: 'Componentes/Navegação/Toolbar',
  component: Toolbar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof Toolbar>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const AtrasDoRemoto: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, ahead: 0, behind: 3 } })),
}

export const OperacaoEmCurso: Story = {
  beforeEach: () => { useApp.setState({ running: { [REPO_PATH]: 'fetch' } }) },
}

export const MergeEmAndamento: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, progress: { kind: 'merge', step: null, total: null, message: 'Merge parou em conflito' } } })),
}

export const RebaseEmAndamento: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, progress: { kind: 'rebase', step: 2, total: 5, message: 'Rebase parou em conflito' } } })),
}

export const DivergidaDoRemoto: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, ahead: 4, behind: 7 } })),
}

export const MuitosCommitsDeDiferenca: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, ahead: 1280, behind: 9999, stashCount: 120 } })),
}

export const SemRemoto: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, remotes: [], ahead: null, behind: null } })),
}

export const BranchComNomeLongo: Story = {
  beforeEach: () => patchTabs((t) => ({ head: { kind: 'branch', name: 'feature/MNM-1234-ajusta-largura-das-colunas-do-grafo-quando-o-nome-do-ramo-e-muito-comprido', upstream: null } })),
}

export const DesfazerDesabilitado: Story = {
  beforeEach: () => patchTabs(() => ({ undo: undoEmpty })),
}

export const SemUpstream: Story = {
  beforeEach: () => patchTabs((t) => ({ head: { kind: 'branch', name: 'feature/nova', upstream: null }, toolbar: { ...t.toolbar, ahead: null, behind: null } })),
}

export const HeadSolto: Story = {
  beforeEach: () => patchTabs((t) => ({ head: { kind: 'detached', sha: 'm03c7e5a' }, toolbar: { ...t.toolbar, ahead: null, behind: null } })),
}
