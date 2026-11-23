import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, openWipDiff, REPO_PATH, selectCommit } from '../stories/mock/scenario'
import { Graph } from './Graph'
import { Panels } from './Panels'

const meta = {
  title: 'Componentes/Painéis/Panels',
  component: Panels,
  args: { path: REPO_PATH, children: null },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(600)],
  beforeEach: async () => { await openRepo(); selectCommit(0) },
  render: (args) => <Panels {...args}><Graph path={args.path} /></Panels>,
} satisfies Meta<typeof Panels>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const ComDiffAberto: Story = { beforeEach: () => openWipDiff() }
