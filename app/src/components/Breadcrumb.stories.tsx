import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, patchTabs, REPO_PATH, SECOND_REPO_PATH } from '../stories/mock/scenario'
import { Breadcrumb } from './Breadcrumb'

const meta = {
  title: 'Componentes/Navegação/Breadcrumb',
  component: Breadcrumb,
  args: { path: SECOND_REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
} satisfies Meta<typeof Breadcrumb>

export default meta
type Story = StoryObj<typeof meta>

export const Submodulo: Story = {
  beforeEach: async () => {
    await openRepo(SECOND_REPO_PATH)
    patchTabs(() => ({ parent: REPO_PATH }))
  },
}
