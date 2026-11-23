import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { commitDetail, LONG_NAME, LONG_SUBJECT, manyFiles } from '../stories/mock/fixtures'
import { forever, frame, mockBackend, openRepo, REPO_PATH, selectCommit } from '../stories/mock/scenario'
import { CommitPanel } from './CommitPanel'

const meta = {
  title: 'Componentes/Painéis/CommitPanel',
  component: CommitPanel,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(560, 380)],
  beforeEach: async () => { await openRepo(); selectCommit(0) },
} satisfies Meta<typeof CommitPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Merge: Story = { beforeEach: () => selectCommit(3) }

export const Carregando: Story = { beforeEach: () => mockBackend({ commit_detail: forever }) }

export const SemSelecao: Story = { beforeEach: () => actions.selectCommit(REPO_PATH, '') }

export const MuitosArquivos: Story = {
  beforeEach: () => mockBackend({
    commit_detail: (args) => {
      const base = commitDetail(String(args.sha))
      const files = manyFiles(300)
      return { ...base, files, added: 4200, removed: 1100 }
    },
  }),
}

export const TextoLongo: Story = {
  beforeEach: () => mockBackend({
    commit_detail: (args) => ({
      ...commitDetail(String(args.sha)),
      author: LONG_NAME,
      subject: LONG_SUBJECT,
      body: `${LONG_SUBJECT}\n\n${'Detalhe adicional do corpo da mensagem, com bastante texto para forçar quebra de linha. '.repeat(12)}`,
    }),
  }),
}

export const SemArquivos: Story = { beforeEach: () => mockBackend({ commit_detail: (args) => ({ ...commitDetail(String(args.sha)), files: [], added: 0, removed: 0 }) }) }
