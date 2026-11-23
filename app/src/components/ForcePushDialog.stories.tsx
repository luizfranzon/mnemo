import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { ForcePushDialog } from './ForcePushDialog'

const meta = {
  title: 'Componentes/Diálogos/ForcePushDialog',
  component: ForcePushDialog,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(360)],
  beforeEach: async () => {
    await openRepo()
    await actions.requestForcePush(REPO_PATH)
  },
} satisfies Meta<typeof ForcePushDialog>

export default meta
type Story = StoryObj<typeof meta>

export const Confirmar: Story = {}
