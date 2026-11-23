import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { FindBar } from './FindBar'

const meta = {
  title: 'Componentes/Base/FindBar',
  component: FindBar,
  args: { text: 'storybook', label: 'Buscar no grafo', count: '2 de 5', disabled: false, onText: () => undefined, onStep: () => undefined, onClose: () => undefined },
  decorators: [(Story) => <div style={{ position: 'relative', height: 120 }}><Story /></div>],
} satisfies Meta<typeof FindBar>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  render: (args) => {
    const [text, setText] = useState(args.text)
    return <FindBar {...args} text={text} onText={setText} />
  },
}

export const SemResultados: Story = { args: { text: 'zzz', count: 'Nenhum resultado', disabled: true } }
