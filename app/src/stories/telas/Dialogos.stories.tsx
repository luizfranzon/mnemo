import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '../../components/App'
import { actions, useApp } from '../../store/app'
import { openRepo, REPO_PATH, screen } from '../mock/scenario'

const meta = {
  title: 'Telas/Fluxos com diálogo',
  component: App,
  parameters: { layout: 'fullscreen' },
  decorators: [screen],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

export const Preferencias: Story = { beforeEach: () => { useApp.setState({ prefsOpen: true }) } }

export const TrocarDeBranch: Story = { beforeEach: () => actions.setPalette('checkout') }

export const CriarBranch: Story = { beforeEach: () => actions.setPalette('createBranch') }

export const DescartarMudancas: Story = { beforeEach: async () => { await actions.requestDiscard(REPO_PATH, ['app/src/components/Palette.tsx']) } }

export const ForcePush: Story = { beforeEach: async () => { await actions.requestForcePush(REPO_PATH) } }

export const EscolherRemotoDoPush: Story = {
  beforeEach: () => { useApp.setState({ pushPrompt: { path: REPO_PATH, branch: 'feature/nova', remotes: ['origin', 'upstream'] } }) },
}
