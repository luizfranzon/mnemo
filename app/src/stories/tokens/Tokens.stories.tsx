import type { Meta, StoryObj } from '@storybook/react-vite'
import { Colors, Elevation, Heights, Radii, Spacing, Typography } from './TokenSections'

const meta = {
  title: 'Tokens',
  parameters: { layout: 'padded' },
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Cores: Story = { render: () => <Colors /> }
export const Tipografia: Story = { render: () => <Typography /> }
export const Espacamento: Story = { name: 'Espaçamento', render: () => <Spacing /> }
export const Raios: Story = { render: () => <Radii /> }
export const Elevacao: Story = { name: 'Elevação', render: () => <Elevation /> }
export const Alturas: Story = { render: () => <Heights /> }
