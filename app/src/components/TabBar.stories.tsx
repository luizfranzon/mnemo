import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions, useApp } from '../store/app'
import { frame, openRepo, openTwoRepos, REPO_PATH, withReviews } from '../stories/mock/scenario'
import { TabBar } from './TabBar'

const meta = {
  title: 'Componentes/Navegação/TabBar',
  component: TabBar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
} satisfies Meta<typeof TabBar>

export default meta
type Story = StoryObj<typeof meta>

export const SemAbas: Story = {}

export const DuasAbas: Story = { beforeEach: async () => { await openTwoRepos() } }

export const UmaAba: Story = { beforeEach: async () => { await openRepo() } }

export const MuitasAbas: Story = {
  beforeEach: async () => {
    for (let i = 0; i < 14; i++) await openRepo(`/home/dev/projetos/repositorio-numero-${i + 1}`)
  },
  parameters: { docs: { description: { story: '14 abas abertas: a barra deve rolar ou encolher as abas sem esconder a ativa.' } } },
}

export const NomeLongo: Story = {
  beforeEach: async () => {
    await openRepo('/home/dev/projetos/um-repositorio-com-um-nome-extremamente-comprido-para-testar-truncamento')
    await openRepo()
  },
}

export const AbaOcupada: Story = {
  beforeEach: async () => {
    await openTwoRepos()
    useApp.setState({ running: { [REPO_PATH]: 'fetch' } })
  },
}

export const AbaEmRevisao: Story = {
  beforeEach: async () => {
    withReviews()
    await openTwoRepos()
    await actions.openReview(REPO_PATH, 'fix/review-comments')
  },
}
