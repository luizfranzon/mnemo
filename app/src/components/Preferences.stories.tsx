import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame, openRepo } from '../stories/mock/scenario'
import { Preferences } from './Preferences'

const meta = {
  title: 'Componentes/Diálogos/Preferences',
  component: Preferences,
  parameters: { layout: 'fullscreen' },
  decorators: [frame(640)],
  beforeEach: async () => {
    await openRepo()
    useApp.setState({ prefsOpen: true })
  },
} satisfies Meta<typeof Preferences>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
