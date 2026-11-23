import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { FILE_VIEWS, Segmented } from './Segmented'

const meta = {
  title: 'Componentes/Base/Segmented',
  component: Segmented,
  args: { label: 'Visão dos arquivos', options: FILE_VIEWS, value: 'path', onChange: () => undefined },
} satisfies Meta<typeof Segmented>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(args.value)
    return <Segmented {...args} value={value} onChange={setValue} />
  },
}

export const TresOpcoes: Story = {
  args: { label: 'Escopo', options: [{ id: 'a', label: 'Staged' }, { id: 'b', label: 'Unstaged' }, { id: 'c', label: 'Todos' }], value: 'c' },
}
