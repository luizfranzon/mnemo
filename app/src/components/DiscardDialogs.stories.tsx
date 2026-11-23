import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { DiscardDialogs } from './DiscardDialogs'

const preview = { trackedChanges: 3, untrackedFiles: 1, untrackedBytes: 2048, exceedsLimit: false }

const meta = {
  title: 'Componentes/Diálogos/DiscardDialogs',
  component: DiscardDialogs,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof DiscardDialogs>

export default meta
type Story = StoryObj<typeof meta>

export const DescartarMudancas: Story = {
  beforeEach: () => { useApp.setState({ discardPrompt: { path: REPO_PATH, paths: ['app/src/components/Palette.tsx'], preview } }) },
}

export const DescartarSemDesfazer: Story = {
  beforeEach: () => { useApp.setState({ discardPrompt: { path: REPO_PATH, paths: [], preview: { ...preview, untrackedBytes: 900_000_000, exceedsLimit: true } } }) },
}

export const ResetHard: Story = {
  beforeEach: () => { useApp.setState({ resetPrompt: { path: REPO_PATH, target: 'm03c7e5a', preview: { ...preview, commits: 4 } } }) },
}

export const RestaurarComoCopia: Story = {
  beforeEach: () => { useApp.setState({ restoreConflict: { path: REPO_PATH, opId: 1, paths: ['app/src/components/Palette.tsx'] } }) },
}

export const CheckoutComMudancas: Story = {
  beforeEach: () => { useApp.setState({ checkoutPrompt: { path: REPO_PATH, target: 'main', remote: null, conflicts: 2, behind: 0 } }) },
}
