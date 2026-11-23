import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
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

export const SemUpstream: Story = {
  beforeEach: () => patchTabs((t) => ({ head: { kind: 'branch', name: 'feature/nova', upstream: null }, toolbar: { ...t.toolbar, ahead: null, behind: null } })),
}

export const HeadSolto: Story = {
  beforeEach: () => patchTabs((t) => ({ head: { kind: 'detached', sha: 'm03c7e5a' }, toolbar: { ...t.toolbar, ahead: null, behind: null } })),
}
