import type { Meta, StoryObj } from '@storybook/react-vite'
import { Avatar } from './avatar'

const meta = {
  title: 'Componentes/Base/Avatar',
  component: Avatar,
  args: { name: 'Luiz Franzon', email: 'luiz@exemplo.dev', small: false, checked: false },
} satisfies Meta<typeof Avatar>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}
export const Pequeno: Story = { args: { small: true } }
export const Marcado: Story = { args: { checked: true } }

export const NomeVazio: Story = { args: { name: '', email: '' } }

export const UmaPalavra: Story = { args: { name: 'Marina', email: 'marina@exemplo.dev' } }

export const NomeLongo: Story = { args: { name: 'Maria Fernanda de Albuquerque Santos Figueiredo', email: 'maria.fernanda@exemplo.dev' } }

export const Acentos: Story = { args: { name: 'Álvaro Épura', email: 'alvaro@exemplo.dev' } }

export const Cores: Story = {
  render: () => <div style={{ display: 'flex', gap: 'var(--space-3)' }}>
    {['Marina Alves', 'Caio Ribeiro', 'Ana Souza', 'Bruno Lima', 'Carla Dias'].map((name) => <Avatar key={name} name={name} email={`${name.split(' ')[0]!.toLowerCase()}@exemplo.dev`} />)}
  </div>,
}
