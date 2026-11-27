import type { Meta, StoryObj } from '@storybook/react-vite'
import { diffOf } from '../stories/mock/fixtures'
import { forever, frame, mockBackend, openCommitDiff, openRepo, openWipDiff, REPO_PATH } from '../stories/mock/scenario'
import { DiffView } from './DiffView'

const meta = {
  title: 'Componentes/Diff e Conflito/DiffView',
  component: DiffView,
  args: { path: REPO_PATH },
  parameters: { layout: 'fullscreen' },
  decorators: [frame(520)],
  beforeEach: async () => { await openRepo() },
} satisfies Meta<typeof DiffView>

export default meta
type Story = StoryObj<typeof meta>

export const DeCommit: Story = { beforeEach: () => openCommitDiff() }

export const MudancaNaoPreparada: Story = { beforeEach: () => openWipDiff(false) }

export const MudancaPreparada: Story = { beforeEach: () => openWipDiff(true) }

export const Binario: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => ({ path: String(args.file), oldPath: null, binary: true, tooLarge: false, encoding: 'binary', encodingId: 'binary', guessed: false, stageable: false, added: 0, removed: 0, hunks: [], lines: [] }) })
    openWipDiff(false)
  },
}

export const Carregando: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: forever })
    openWipDiff(false)
  },
}

export const SemMudancasDeTexto: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => diffOf(String(args.file), []) })
    openWipDiff(false)
  },
}

export const Renomeado: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => diffOf(String(args.file), [], 'app/src/components/ContextMenu.tsx') })
    openCommitDiff()
  },
}

export const ArquivoNovo: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => diffOf(String(args.file), [['+', 'export const ROW = 28'], ['+', 'export const OVERSCAN = 12'], ['+', '']]) })
    openWipDiff(true)
  },
}

export const LinhasMuitoLongas: Story = {
  beforeEach: () => {
    const longLine = `const mensagem = '${'texto muito longo sem quebra '.repeat(30)}'`
    mockBackend({ file_diff: (args) => diffOf(String(args.file), [['=', 'function exemplo() {'], ['-', longLine], ['+', `${longLine}.trim()`], ['=', '}']]) })
    openWipDiff(false)
  },
  parameters: { docs: { description: { story: 'Linha de ~900 caracteres: deve rolar na horizontal sem quebrar o layout.' } } },
}

export const ArquivoGrande: Story = {
  beforeEach: () => {
    const rows = Array.from({ length: 4000 }, (_, i): ['=' | '+' | '-', string] => [i % 5 === 0 ? '+' : i % 11 === 0 ? '-' : '=', `linha ${i} do arquivo com conteúdo de exemplo`])
    mockBackend({ file_diff: (args) => diffOf(String(args.file), rows) })
    openWipDiff(false)
  },
}

export const GrandeDemais: Story = {
  beforeEach: () => {
    mockBackend({ file_diff: (args) => ({ path: String(args.file), oldPath: null, binary: false, tooLarge: true, encoding: 'UTF-8', encodingId: 'utf-8', guessed: true, stageable: false, added: 0, removed: 0, hunks: [], lines: [] }) })
    openWipDiff(false)
  },
}
