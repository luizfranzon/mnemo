import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { repoInfo } from '../stories/mock/fixtures'
import { frame, mockBackend, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { SubmoduleCard } from './SubmoduleCard'

const meta = {
  title: 'Componentes/Painéis/SubmoduleCard',
  component: SubmoduleCard,
  args: { parent: REPO_PATH, name: 'vendor/libgit-sys' },
  parameters: { layout: 'padded' },
  decorators: [frame('auto', 300)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof SubmoduleCard>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const NaoIniciado: Story = {
  beforeEach: () => mockBackend({ open_repository: () => repoInfo(REPO_PATH, 'mnemo') }),
}

export const NomeLongo: Story = {
  args: { name: 'vendor/bibliotecas/internas/uma-biblioteca-com-um-caminho-extremamente-longo-para-truncar' },
}

export const Ocupado: Story = {
  beforeEach: () => { useApp.setState({ running: { [`${REPO_PATH}/vendor/libgit-sys`]: 'fetch' } }) },
}
