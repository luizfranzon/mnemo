import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { CommitDialogs } from './CommitDialogs'

const SHA = 'f01a9c3e5b7d2f4a6c8e0b1d3f5a7c9e1b3d5f70'

const meta = {
  title: 'Componentes/Diálogos/CommitDialogs',
  component: CommitDialogs,
  args: { path: REPO_PATH, close: () => undefined, dialog: { type: 'tag', sha: SHA, annotated: false } },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof CommitDialogs>

export default meta
type Story = StoryObj<typeof meta>

export const Tag: Story = {}

export const TagAnotada: Story = { args: { dialog: { type: 'tag', sha: SHA, annotated: true } } }

export const EditarMensagem: Story = { args: { dialog: { type: 'reword', sha: SHA } } }

export const RestaurarArquivo: Story = { args: { dialog: { type: 'restoreFile', sha: SHA, file: 'app/src/components/Graph.tsx' } } }

export const ExcluirArquivo: Story = { args: { dialog: { type: 'deleteFile', file: 'app/src/components/Legacy.tsx' } } }
