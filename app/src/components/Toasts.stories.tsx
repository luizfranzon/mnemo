import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, REPO_PATH } from '../stories/mock/scenario'
import { Toasts } from './Toasts'

const meta = {
  title: 'Componentes/Feedback/Toasts',
  component: Toasts,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(360)],
} satisfies Meta<typeof Toasts>

export default meta
type Story = StoryObj<typeof meta>

export const Sucesso: Story = { beforeEach: () => { useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'Commit criado' }] }) } }

export const ComDesfazer: Story = { beforeEach: () => { useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'Merge de main em feature/storybook', undoPath: REPO_PATH }] }) } }

export const Informativo: Story = { beforeEach: () => { useApp.setState({ toasts: [{ id: 1, text: 'Você já está na versão mais recente', info: true }] }) } }

export const Erro: Story = { beforeEach: () => { useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'fatal: não foi possível acessar o remoto', error: true }] }) } }

export const ErroComTentarDeNovo: Story = {
  beforeEach: () => { useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'Outro processo git está em execução (index.lock)', error: true, retry: async () => undefined }] }) },
}

export const ErroComAcoes: Story = {
  beforeEach: () => { useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'Pull barrado: arquivos locais seriam sobrescritos', error: true, buttons: [{ label: 'Stash e tentar de novo', run: async () => undefined }, { label: 'Descartar e tentar de novo', run: async () => undefined }] }] }) },
}

export const TextoLongo: Story = {
  beforeEach: () => {
    const text = `fatal: não foi possível acessar 'https://git.exemplo.dev/organizacao/projeto-com-nome-muito-comprido.git/': ${'a conexão foi encerrada pelo servidor remoto. '.repeat(6)}`
    useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text, error: true, retry: async () => undefined }] })
  },
}

export const ErroEmVariosRepositorios: Story = {
  beforeEach: () => {
    useApp.setState({ toasts: [
      { id: 1, title: 'mnemo', text: 'Fetch falhou: sem acesso à rede', error: true, retry: async () => undefined },
      { id: 2, title: 'mnemo-docs', text: 'Push rejeitado: o remoto tem commits que você não tem', error: true },
    ] })
  },
}

export const Empilhados: Story = {
  beforeEach: () => {
    useApp.setState({ toasts: [{ id: 1, title: 'mnemo', text: 'Fetch concluído' }, { id: 2, title: 'mnemo', text: 'Push concluído', undoPath: REPO_PATH }, { id: 3, text: 'Preferências salvas' }] })
  },
}
