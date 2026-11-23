import type { Meta, StoryObj } from '@storybook/react-vite'
import { useApp } from '../store/app'
import { frame } from '../stories/mock/scenario'
import { StatusBar } from './StatusBar'

const meta = {
  title: 'Componentes/Navegação/StatusBar',
  component: StatusBar,
  parameters: { layout: 'fullscreen' },
  decorators: [frame('auto')],
} satisfies Meta<typeof StatusBar>

export default meta
type Story = StoryObj<typeof meta>

export const Padrao: Story = {}

export const AtualizacaoDisponivel: Story = { beforeEach: () => { useApp.setState({ update: { status: 'available', version: '0.6.0' } }) } }

export const Baixando: Story = { beforeEach: () => { useApp.setState({ update: { status: 'downloading', version: '0.6.0', percent: 64 } }) } }

export const BaixandoNoInicio: Story = { beforeEach: () => { useApp.setState({ update: { status: 'downloading', version: '0.6.0', percent: 0 } }) } }

export const BaixandoQuaseConcluido: Story = { beforeEach: () => { useApp.setState({ update: { status: 'downloading', version: '0.6.0', percent: 99 } }) } }

export const ProntoParaReiniciar: Story = { beforeEach: () => { useApp.setState({ update: { status: 'ready', version: '0.6.0' } }) } }
