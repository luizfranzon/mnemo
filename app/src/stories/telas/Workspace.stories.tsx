import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '../../components/App'
import { actions, useApp } from '../../store/app'
import { openTwoRepos, openCommitDiff, openWipDiff, patchTabs, REPO_PATH, SECOND_REPO_PATH, screen, selectCommit, withConflicts } from '../mock/scenario'

const meta = {
  title: 'Telas/Workspace',
  component: App,
  parameters: { layout: 'fullscreen' },
  decorators: [screen],
  beforeEach: async () => { await openTwoRepos() },
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

export const GrafoDeCommits: Story = { beforeEach: () => selectCommit(0) }

export const CommitDeMerge: Story = { beforeEach: () => selectCommit(3) }

export const MudancasNaoCommitadas: Story = { beforeEach: () => actions.selectCommit(REPO_PATH, 'wip') }

export const DiffDeCommit: Story = { beforeEach: () => openCommitDiff() }

export const DiffDeMudancaLocal: Story = { beforeEach: () => openWipDiff(false) }

export const FiltroPorAutor: Story = { beforeEach: () => actions.setAuthorFilter(REPO_PATH, ['marina@exemplo.dev']) }

export const ResolvendoConflito: Story = {
  beforeEach: async () => {
    withConflicts()
    patchTabs((t) => ({ toolbar: { ...t.toolbar, progress: { kind: 'merge', step: null, total: null, message: 'Merge parou em conflito' } } }))
    actions.selectCommit(REPO_PATH, 'wip')
    actions.openConflict(REPO_PATH, 'app/src/components/Toolbar.tsx')
  },
}

export const PushRejeitado: Story = {
  beforeEach: () => { useApp.setState({ pushRejected: { path: REPO_PATH, branch: 'feature/storybook', upstream: 'origin/feature/storybook' } }) },
}

export const OperacaoComToasts: Story = {
  beforeEach: () => {
    useApp.setState({
      running: { [REPO_PATH]: 'pull' },
      toasts: [{ id: 1, title: 'mnemo', text: 'Fetch concluído' }, { id: 2, title: 'mnemo', text: 'Merge de main em feature/storybook', undoPath: REPO_PATH }],
    })
  },
}

export const AtualizacaoDisponivel: Story = { beforeEach: () => { useApp.setState({ update: { status: 'available', version: '0.6.0' } }) } }

export const UmaAbaSo: Story = { beforeEach: () => actions.closeTab(SECOND_REPO_PATH) }

export const BranchDivergida: Story = {
  beforeEach: () => patchTabs((t) => ({ toolbar: { ...t.toolbar, ahead: 2, behind: 3 } })),
}
