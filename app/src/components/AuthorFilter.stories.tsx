import type { Meta, StoryObj } from '@storybook/react-vite'
import { actions } from '../store/app'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { AuthorFilter } from './AuthorFilter'

const meta = {
  title: 'Componentes/Painéis/AuthorFilter',
  component: AuthorFilter,
  args: { path: REPO_PATH, anchor: { left: 24, top: 24, right: 24, bottom: 24 }, onClose: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof AuthorFilter>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const ComSelecao: Story = { beforeEach: () => actions.setAuthorFilter(REPO_PATH, ['marina@exemplo.dev']) }
