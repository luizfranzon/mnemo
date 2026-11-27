import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { RadioGroup } from './RadioGroup'

const options = [
  { value: 'merge', label: 'Merge', help: 'Cria um commit de merge quando as branches divergem.' },
  { value: 'ffOnly', label: 'Somente fast-forward', help: 'Falha se a branch divergiu.' },
  { value: 'rebase', label: 'Rebase' },
]

const meta = {
  title: 'Componentes/Base/RadioGroup',
  component: RadioGroup,
  args: { name: 'pull', label: 'Estratégia de pull', value: 'merge', options, onChange: () => undefined },
} satisfies Meta<typeof RadioGroup>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {
  render: (args) => {
    const [value, setValue] = useState<string>(args.value)
    return <RadioGroup {...args} value={value} onChange={setValue} />
  },
}
