import type { Meta, StoryObj } from '@storybook/react-vite'
import type { FileChange } from '../bridge/types'
import { LONG_PATH } from '../stories/mock/fixtures'
import { WipDirRow, WipFileRow, WipSectionHead, type WipDirRowData, type WipFileRowData } from './WipRows'

const noop = () => undefined
const file = (path: string, status: FileChange['status'], added: number | null, removed: number | null): FileChange => ({ path, oldPath: null, status, added, removed })

const fileRow = (path: string, staged: boolean, status: FileChange['status'] = 'M'): WipFileRowData => {
  const slash = path.lastIndexOf('/')
  return { type: 'file', key: path, depth: 0, dir: path.slice(0, slash + 1), name: path.slice(slash + 1), file: file(path, status, 12, 3), staged } as WipFileRowData
}

const dirRow = (staged: boolean): WipDirRowData => ({ type: 'dir', key: 'app/src', depth: 0, name: 'app/src', path: 'app/src', count: 8, staged }) as WipDirRowData

const meta = {
  title: 'Componentes/Painéis/WipRows',
  parameters: { layout: 'padded' },
  decorators: [(Story) => <div className="wip-panel" style={{ width: 420, position: 'relative', height: 120 }}><div className="wip-files" style={{ position: 'relative' }}><Story /></div></div>],
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

const style = { position: 'relative' as const, height: 28 }

export const ArquivoNaoPreparado: Story = {
  render: () => <WipFileRow row={fileRow('app/src/components/Palette.tsx', false)} paths={['app/src/components/Palette.tsx']} selected={false} active={false} style={style}
    onClick={noop} onContextMenu={noop} onMenu={noop} onDiscard={noop} onStage={noop} />,
}

export const ArquivoPreparado: Story = {
  render: () => <WipFileRow row={fileRow('app/package.json', true, 'A')} paths={['app/package.json']} selected={false} active={false} style={style}
    onClick={noop} onContextMenu={noop} onMenu={noop} onDiscard={noop} onStage={noop} />,
}

export const ArquivoSelecionado: Story = {
  render: () => <WipFileRow row={fileRow('app/src/styles.css', false)} paths={['app/src/styles.css', 'app/src/main.tsx', 'app/package.json']} selected active style={style}
    onClick={noop} onContextMenu={noop} onMenu={noop} onDiscard={noop} onStage={noop} />,
}

export const CaminhoMuitoLongo: Story = {
  render: () => <WipFileRow row={fileRow(LONG_PATH, false)} paths={[LONG_PATH]} selected={false} active={false} style={style}
    onClick={noop} onContextMenu={noop} onMenu={noop} onDiscard={noop} onStage={noop} />,
}

export const Pasta: Story = {
  render: () => <WipDirRow row={dirRow(false)} open style={style} onToggle={noop} onContextMenu={noop} onMenu={noop} onStage={noop} />,
}

export const CabecalhoNaoPreparados: Story = { render: () => <WipSectionHead staged={false} count={12} style={{ ...style, height: 32 }} onStageAll={noop} /> }

export const CabecalhoPreparados: Story = { render: () => <WipSectionHead staged count={4} style={{ ...style, height: 32 }} onStageAll={noop} /> }

export const CabecalhoVazio: Story = { render: () => <WipSectionHead staged={false} count={0} style={{ ...style, height: 32 }} onStageAll={noop} /> }
