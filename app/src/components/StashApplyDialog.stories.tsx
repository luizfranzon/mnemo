import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { StashApplyDialog } from './StashApplyDialog'

const meta = {
  title: 'Componentes/Diálogos/StashApplyDialog',
  component: StashApplyDialog,
  args: { path: REPO_PATH, index: 0, name: 'stash@{0}: WIP em Preferences', close: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(520)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof StashApplyDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
