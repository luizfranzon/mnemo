import type { Meta, StoryObj } from '@storybook/react-vite'
import { useState } from 'react'
import { Tabs } from './Tabs'

const TABS = [{ id: 'commit', label: 'Commit', icon: 'commit' }, { id: 'stash', label: 'Stash', icon: 'stash' }] as const

const meta = {
  title: 'Componentes/Base/Tabs',
  component: Tabs,
  args: { label: 'Ação', tabs: TABS, value: 'commit', onChange: () => undefined, className: 'wip-tabs' },
  render: (args) => {
    const [value, setValue] = useState(args.value)
    return <div className="wip-compose"><Tabs {...args} value={value} onChange={setValue} /></div>
  },
} satisfies Meta<typeof Tabs>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const StashSelecionado: Story = { args: { value: 'stash' } }

export const SemIcones: Story = { args: { tabs: [{ id: 'commit', label: 'Commit' }, { id: 'stash', label: 'Stash' }] } }
