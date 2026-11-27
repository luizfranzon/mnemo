import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { BranchDialogs } from './BranchDialogs'

const meta = {
  title: 'Componentes/Diálogos/BranchDialogs',
  component: BranchDialogs,
  args: { path: REPO_PATH, close: () => undefined, dialog: { type: 'rename', from: 'feature/storybook' } },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(360)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof BranchDialogs>

export default meta
type Story = StoryObj<typeof meta>

export const Renomear: Story = {}

export const ExcluirLocal: Story = { args: { dialog: { type: 'delete', from: 'local', local: { name: 'fix/review-comments', current: false }, remote: null } } }

export const ExcluirLocalERemota: Story = {
  args: { dialog: { type: 'delete', from: 'local', local: { name: 'feature/storybook', current: false }, remote: { remote: 'origin', branch: 'feature/storybook' } } },
}

export const ExcluirBranchAtual: Story = { args: { dialog: { type: 'delete', from: 'local', local: { name: 'feature/storybook', current: true }, remote: null } } }
