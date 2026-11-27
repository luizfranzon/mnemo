import type { Meta, StoryObj } from '@storybook/react-vite'
import { Button } from './Button'

const meta = {
  title: 'Componentes/Base/Button',
  component: Button,
  args: { children: 'Cancelar' },
} satisfies Meta<typeof Button>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Primario: Story = { args: { primary: true, children: 'Salvar' } }

export const Perigo: Story = { args: { danger: true, children: 'Excluir' } }

export const PrimarioPerigo: Story = { args: { primary: true, danger: true, children: 'Reset hard' } }

export const Destacado: Story = { args: { tinted: true, small: true, children: 'Preparar' } }

export const Pequeno: Story = { args: { small: true, children: 'Tirar' } }

export const Desabilitado: Story = { args: { primary: true, disabled: true, children: 'Salvar' } }

export const Carregando: Story = { args: { primary: true, loading: true, children: 'Force Push' } }

export const TextoLongo: Story = { args: { primary: true, children: 'Commitar 240 arquivos em feature/MNM-1234-ajusta-largura-das-colunas' }, decorators: [(Story) => <div style={{ width: 260 }}><Story /></div>] }

export const Todos: Story = {
  render: () => <div style={{ display: 'flex', gap: 'var(--space-3)', alignItems: 'center', flexWrap: 'wrap' }}>
    <Button>Padrão</Button>
    <Button primary>Primário</Button>
    <Button danger>Perigo</Button>
    <Button primary danger>Primário perigo</Button>
    <Button tinted small>Destacado</Button>
    <Button small>Pequeno</Button>
    <Button disabled>Desabilitado</Button>
    <Button primary loading>Carregando</Button>
  </div>,
}
