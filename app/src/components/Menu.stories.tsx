import type { Meta, StoryObj } from '@storybook/react-vite'
import { Menu } from './Menu'
import type { MenuEntry } from './menuModel'

const items: MenuEntry[] = [
  { label: 'Checkout', shortcut: 'Enter', run: () => undefined },
  { label: 'Criar branch aqui…', run: () => undefined },
  '-',
  { label: 'Merge em feature/storybook', run: () => undefined },
  { label: 'Rebase em main', reason: 'Há mudanças não commitadas', run: () => undefined },
  { label: 'Reset hard para aqui', warn: true, run: () => undefined },
  '-',
  { label: 'Visibilidade', submenu: [{ label: 'Ocultar', run: () => undefined }, { label: 'Solo', run: () => undefined }] },
  { label: 'Excluir branch…', danger: true, run: () => undefined },
]

const meta = {
  title: 'Componentes/Base/Menu',
  component: Menu,
  args: { items, label: 'Menu de contexto', anchor: { left: 32, top: 32, right: 32, bottom: 32 }, onClose: () => undefined },
  parameters: { layout: 'fullscreen' },
  decorators: [(Story) => <div style={{ height: 420 }}><Story /></div>],
} satisfies Meta<typeof Menu>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const ListaLonga: Story = {
  args: {
    label: 'Branches',
    items: Array.from({ length: 60 }, (_, i): MenuEntry => ({ label: i === 3 ? 'feature/MNM-1234-ajusta-largura-das-colunas-do-grafo-quando-o-nome-e-muito-comprido' : `feature/tarefa-${i + 1}`, shortcut: i < 9 ? `Ctrl+${i + 1}` : undefined, run: () => undefined })),
  },
}

export const ItensDesabilitados: Story = {
  args: {
    label: 'Ações',
    items: [
      { label: 'Merge em main', reason: 'Há mudanças não commitadas', run: () => undefined },
      { label: 'Rebase em main', reason: 'Já existe um rebase em andamento', run: () => undefined },
      { label: 'Excluir branch atual…', reason: 'Não dá para excluir a branch em que você está', danger: true, run: () => undefined },
    ],
  },
}

export const ComRadio: Story = {
  args: {
    label: 'Ordenar',
    items: [{ label: 'Ordenar por', heading: true }, { label: 'Topologia', checked: true, run: () => undefined }, { label: 'Data', checked: false, run: () => undefined }],
  },
}
