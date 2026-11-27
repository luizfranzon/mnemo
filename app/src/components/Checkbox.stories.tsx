import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Checkbox } from './Checkbox'

const meta = {
  title: 'Componentes/Base/Checkbox',
  component: Checkbox,
  args: { checked: false, label: 'Assinar o commit', onChange: () => undefined },
  render: (args) => {
    const [checked, setChecked] = useState(args.checked)
    return <Checkbox {...args} checked={checked} onChange={setChecked} />
  },
} satisfies Meta<typeof Checkbox>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const Marcado: Story = { args: { checked: true } }

export const Indeterminado: Story = { args: { indeterminate: true } }

export const Desabilitado: Story = { args: { disabled: true, checked: true } }

export const ComAjuda: Story = { args: { help: 'Cada commit é assinado com a chave GPG configurada no git.' } }

export const TextoLongo: Story = {
  args: { label: 'Fazer push para origin/feature/MNM-1234-ajusta-largura-das-colunas-do-grafo depois do commit' },
  decorators: [(Story) => <div style={{ width: 260 }}><Story /></div>],
}
