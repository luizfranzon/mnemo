import type { Meta, StoryObj } from '@storybook/react-vite'
import { App } from '../../components/App'
import { mockBackend, screen } from '../mock/scenario'

const meta = {
  title: 'Telas/Início',
  component: App,
  parameters: { layout: 'fullscreen' },
  decorators: [screen],
} satisfies Meta<typeof App>

export default meta
type Story = StoryObj<typeof meta>

export const SemRepositorio: Story = {}

export const GitNaoEncontrado: Story = {
  beforeEach: () => mockBackend({ check_git: () => { throw { code: 'gitMissing', message: 'git não encontrado' } } }),
}

export const VerificandoGit: Story = {
  beforeEach: () => mockBackend({ check_git: () => new Promise(() => undefined) }),
}
