import type { Meta, StoryObj } from '@storybook/react-vite'
import { mockBackend, frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { WipPanel } from './WipPanel'

const meta = {
  title: 'Componentes/Painéis/WipPanel',
  component: WipPanel,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(620, 380)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof WipPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const SemMudancas: Story = {
  beforeEach: () => mockBackend({ wip_status: () => ({ unstaged: [], staged: [] }) }),
}
