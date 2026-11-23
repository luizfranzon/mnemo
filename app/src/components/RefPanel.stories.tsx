import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { RefPanel } from './RefPanel'

const meta = {
  title: 'Componentes/Painéis/RefPanel',
  component: RefPanel,
  args: { path: REPO_PATH, rail: false, expand: () => undefined, collapse: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(560, 280)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof RefPanel>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Recolhido: Story = { args: { rail: true }, decorators: [frame(560, 44)] }
