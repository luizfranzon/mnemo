import type { Meta, StoryObj } from '@storybook/react-vite'
import { frame, openRepo, REPO_PATH } from '../stories/mock/scenario'
import { EncodingPicker } from './EncodingPicker'

const meta = {
  title: 'Componentes/Diff e Conflito/EncodingPicker',
  component: EncodingPicker,
  args: { path: REPO_PATH, anchor: { left: 24, top: 24, right: 24, bottom: 24 }, value: 'guess', onPick: () => undefined, onClose: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(420)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof EncodingPicker>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const ComEscolha: Story = { args: { value: 'windows-1252' } }
