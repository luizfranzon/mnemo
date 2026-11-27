import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openRepo, REPO_PATH, withConflicts } from '../stories/mock/scenario'
import { ConflictEditor } from './ConflictEditor'

const meta = {
  title: 'Componentes/Diff e Conflito/ConflictEditor',
  component: ConflictEditor,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(560)],
  beforeEach: async () => {
    withConflicts()
    await openRepo()
  },
} satisfies Meta<typeof ConflictEditor>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = { beforeEach: () => actions.openConflict(REPO_PATH, 'app/src/components/Toolbar.tsx') }

export const Binario: Story = { beforeEach: () => actions.openConflict(REPO_PATH, 'app/assets/logo.png') }
