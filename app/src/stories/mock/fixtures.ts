import type {
  BranchInfo, CommitDetail, ConflictDoc, ConflictFile, DiffLine, FileChange, FileDiff, GraphCommit, GraphPage, GraphSegment, RefListing, RepositoryInfo,
  ReviewComment, ReviewState, ReviewSummary, UndoRedoState, WipStatus,
} from '../../bridge/types'

export const REPO_PATH = '/home/dev/projetos/mnemo'
export const SECOND_REPO_PATH = '/home/dev/projetos/mnemo-docs'
export const SUBMODULE_NAME = 'vendor/libgit-sys'

const NOW = Math.floor(Date.now() / 1000)
const HOUR = 3600
const LANE_COLORS = ['#4fb3d9', '#d65bd0', '#e5534b', '#e0a43a', '#5b8def', '#46b866', '#c4a7f5', '#f08a5d']
const laneColor = (lane: number) => LANE_COLORS[lane % LANE_COLORS.length]!

export const AUTHORS = [
  { name: 'Luiz Franzon', email: 'luiz@exemplo.dev' },
  { name: 'Marina Alves', email: 'marina@exemplo.dev' },
  { name: 'Caio Ribeiro', email: 'caio@exemplo.dev' },
]

export const undoIdle: UndoRedoState = {
  undo: { enabled: true, label: 'commit', reason: null },
  redo: { enabled: false, label: null, reason: 'Nada para refazer' },
}

export const undoEmpty: UndoRedoState = {
  undo: { enabled: false, label: null, reason: 'Nada para desfazer' },
  redo: { enabled: false, label: null, reason: 'Nada para refazer' },
}

export const repoInfo = (path: string, name: string): RepositoryInfo => ({
  path,
  name,
  mainRepoName: null,
  head: { kind: 'branch', name: 'feature/storybook', upstream: 'origin/feature/storybook' },
  undo: undoIdle,
  toolbar: { remotes: ['origin'], ahead: 1, behind: 0, lastFetchEpoch: NOW - 300, stashCount: 1, pullMode: 'merge', progress: null },
})

interface Node { sha: string; parents: string[]; author: number; ago: number; subject: string; description?: string; refs?: GraphCommit['refs']; head?: boolean }

const NODES: Node[] = [
  { sha: 'f01a9c3e5b7d2f4a6c8e0b1d3f5a7c9e1b3d5f70', parents: ['f02b8d4f6c8e1a3c5e7a9c1e3b5d7f9a1c3e5b71'], author: 0, ago: 1, subject: 'Adiciona stories dos componentes', description: 'Cobre tokens, componentes e telas.',
    refs: [{ name: 'feature/storybook', kind: 'local', current: true, upstream: 'origin/feature/storybook' }], head: true },
  { sha: 'f02b8d4f6c8e1a3c5e7a9c1e3b5d7f9a1c3e5b71', parents: ['m03c7e5a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f92'], author: 0, ago: 5, subject: 'Configura o Storybook com Vite 8',
    refs: [{ name: 'origin/feature/storybook', kind: 'remote', current: false, upstream: null }] },
  { sha: 'm01d6f4b8a0c2e4a6c8e0b2d4f6a8c0e2b4d6f803', parents: ['m02e5a3c7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f14'], author: 1, ago: 20, subject: 'Corrige rolagem horizontal do diff lado a lado',
    refs: [{ name: 'main', kind: 'local', current: false, upstream: 'origin/main' }, { name: 'origin/main', kind: 'remote', current: false, upstream: null }] },
  { sha: 'm02e5a3c7b9d1f3a5c7e9b1d3f5a7c9e1b3d5f14', parents: ['m03c7e5a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f92', 'x01f4b2d6a8c0e2a4c6e8b0d2f4a6c8e0b2d4f625'], author: 1, ago: 30, subject: 'Merge branch fix/review-comments' },
  { sha: 'x01f4b2d6a8c0e2a4c6e8b0d2f4a6c8e0b2d4f625', parents: ['m03c7e5a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f92'], author: 2, ago: 48, subject: 'Mostra sugestão de troca de linhas no comentário',
    refs: [{ name: 'fix/review-comments', kind: 'local', current: false, upstream: null }] },
  { sha: 'm03c7e5a9b1d3f5a7c9e1b3d5f7a9c1e3b5d7f92', parents: ['m04b3d1f5a7c9e1a3c5e7b9d1f3a5c7e9b1d3f536'], author: 0, ago: 72, subject: 'Persiste larguras dos painéis por repositório' },
  { sha: 'm04b3d1f5a7c9e1a3c5e7b9d1f3a5c7e9b1d3f536', parents: ['m05a2c0e4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e447'], author: 2, ago: 120, subject: 'Prepara a versão 0.5.0',
    refs: [{ name: 'v0.5.0', kind: 'tag', current: false, upstream: null }] },
  { sha: 'm05a2c0e4a6c8e0b2d4f6a8c0e2b4d6f8a0c2e447', parents: ['m06f1b9d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c358'], author: 1, ago: 200, subject: 'Virtualiza a lista de arquivos do painel WIP' },
  { sha: 'm06f1b9d3f5a7c9e1b3d5f7a9c1e3b5d7f9a1c358', parents: [], author: 0, ago: 300, subject: 'Commit inicial' },
]

export const COMMITS: Pick<Node, 'sha' | 'subject'>[] = NODES

function buildGraph(nodes: Node[]): GraphCommit[] {
  let active: ({ sha: string } | null)[] = []
  return nodes.map((node) => {
    const incoming = active.map((slot, lane) => (slot?.sha === node.sha ? lane : -1)).filter((lane) => lane >= 0)
    let lane = incoming[0] ?? active.indexOf(null)
    if (lane < 0) lane = active.length
    const segments: GraphSegment[] = []
    active.forEach((slot, l) => { if (slot && !incoming.includes(l)) segments.push({ fromLane: l, toLane: l, color: laneColor(l), kind: 'pass' }) })
    incoming.forEach((l) => segments.push({ fromLane: l, toLane: lane, color: laneColor(l), kind: 'incoming' }))
    const next = active.map((slot, l) => (incoming.includes(l) ? null : slot))
    while (next.length <= lane) next.push(null)
    next[lane] = null
    node.parents.forEach((parent, index) => {
      const existing = next.findIndex((slot) => slot?.sha === parent)
      if (index === 0 && existing < 0) {
        next[lane] = { sha: parent }
        segments.push({ fromLane: lane, toLane: lane, color: laneColor(lane), kind: 'parent' })
      } else if (existing >= 0) {
        segments.push({ fromLane: lane, toLane: existing, color: laneColor(existing), kind: 'parent' })
      } else {
        let free = next.indexOf(null)
        if (free < 0) free = next.length
        next[free] = { sha: parent }
        segments.push({ fromLane: lane, toLane: free, color: laneColor(free), kind: 'parent' })
      }
    })
    active = next
    while (active.length && active[active.length - 1] === null) active.pop()
    const author = AUTHORS[node.author]!
    const laneCount = Math.max(lane + 1, active.length, ...segments.flatMap((s) => [s.fromLane + 1, s.toLane + 1]))
    return {
      sha: node.sha, parents: node.parents, author: author.name, email: author.email, timestamp: NOW - node.ago * HOUR, subject: node.subject,
      description: node.description ?? '', lane, color: laneColor(lane), laneCount, segments, refs: node.refs ?? [], head: node.head === true, ghost: null, stash: false,
    }
  })
}

export const graphCommits = buildGraph(NODES)

export const graphPage = (wip = { changed: 2, untracked: 1 }): GraphPage => ({ commits: graphCommits, next: null, wip })

export const LONG_NAME = 'Maria Fernanda de Albuquerque Santos Figueiredo'
export const LONG_SUBJECT = 'Refatora a resolução de conflitos do rebase interativo para preservar o autor original e as datas dos commits reaplicados em ramos longos'
export const LONG_BRANCH = 'feature/MNM-1234-ajusta-largura-das-colunas-do-grafo-quando-o-nome-do-ramo-e-muito-comprido'
export const LONG_PATH = 'app/src/components/internal/very/deeply/nested/directory/structure/WithAVeryLongComponentFileNameThatOverflows.test.tsx'

const hex = (n: number) => Math.imul(n, 2654435761).toString(16).padStart(8, '0').padEnd(40, '0')

export const manyCommits = (count: number, wip = { changed: 2, untracked: 1 }): GraphPage => {
  const nodes: Node[] = Array.from({ length: count }, (_, i) => ({
    sha: hex(count - i),
    parents: i === count - 1 ? [] : [hex(count - i - 1)],
    author: i % AUTHORS.length,
    ago: i + 1,
    subject: i % 7 === 3 ? LONG_SUBJECT : `Ajuste ${count - i} no módulo de grafo`,
    refs: i === 0 ? [{ name: 'feature/storybook', kind: 'local', current: true, upstream: 'origin/feature/storybook' }] : undefined,
    head: i === 0,
  }))
  return { commits: buildGraph(nodes), next: null, wip }
}

export const singleCommit = (): GraphPage => ({
  commits: buildGraph([{ sha: NODES[8]!.sha, parents: [], author: 0, ago: 300, subject: 'Commit inicial', refs: [{ name: 'main', kind: 'local', current: true, upstream: null }], head: true }]),
  next: null,
  wip: { changed: 0, untracked: 0 },
})

export const emptyGraph = (): GraphPage => ({ commits: [], next: null, wip: { changed: 0, untracked: 0 } })

export const manyAuthors = (count: number) => Array.from({ length: count }, (_, i) => ({ name: i === 0 ? LONG_NAME : `Pessoa Colaboradora ${i + 1}`, email: `pessoa${i + 1}@exemplo.dev` }))

export const manyRefs = (count: number): RefListing => ({
  ...refListing,
  local: Array.from({ length: count }, (_, i) => ({
    name: i === 1 ? LONG_BRANCH : `feature/tarefa-${i + 1}`, sha: NODES[i % NODES.length]!.sha, current: i === 0,
    upstream: i % 3 === 0 ? `origin/feature/tarefa-${i + 1}` : null, ahead: i % 3 === 0 ? i % 4 : null, behind: i % 3 === 0 ? i % 2 : null,
  })),
  tags: Array.from({ length: count }, (_, i) => ({ name: `v0.${count - i}.0`, sha: NODES[i % NODES.length]!.sha })),
})

export const emptyRefs = (): RefListing => ({
  local: [{ name: 'main', sha: NODES[8]!.sha, current: true, upstream: null, ahead: null, behind: null }],
  remotes: [], worktrees: [], stashes: [], tags: [], submodules: [],
})

export const branches: BranchInfo[] = [
  { name: 'feature/storybook', sha: NODES[0]!.sha, current: true },
  { name: 'main', sha: NODES[2]!.sha, current: false },
  { name: 'fix/review-comments', sha: NODES[4]!.sha, current: false },
]

export const refListing: RefListing = {
  local: [
    { name: 'feature/storybook', sha: NODES[0]!.sha, current: true, upstream: 'origin/feature/storybook', ahead: 1, behind: 0 },
    { name: 'main', sha: NODES[2]!.sha, current: false, upstream: 'origin/main', ahead: 0, behind: 2 },
    { name: 'fix/review-comments', sha: NODES[4]!.sha, current: false, upstream: null, ahead: null, behind: null },
  ],
  remotes: [{
    name: 'origin',
    branches: [
      { remote: 'origin', name: 'main', sha: NODES[2]!.sha, localExists: true },
      { remote: 'origin', name: 'feature/storybook', sha: NODES[1]!.sha, localExists: true },
    ],
    folders: [{ name: 'release', branches: [{ remote: 'origin', name: 'release/0.5', sha: NODES[6]!.sha, localExists: false }] }],
  }],
  worktrees: [{ path: '/home/dev/projetos/mnemo-hotfix', branch: 'hotfix/updater' }],
  stashes: [{ name: 'stash@{0}: WIP em Preferences', sha: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }],
  tags: [{ name: 'v0.5.0', sha: NODES[6]!.sha }, { name: 'v0.4.0', sha: NODES[8]!.sha }],
  submodules: [{ name: SUBMODULE_NAME, sha: '0f1e2d3c4b5a69788796a5b4c3d2e1f001122334' }],
}

const file = (path: string, status: FileChange['status'], added: number | null, removed: number | null, oldPath: string | null = null): FileChange => ({ path, oldPath, status, added, removed })

export const wipStatus: WipStatus = {
  unstaged: [file('app/src/components/Palette.tsx', 'M', 12, 3), file('app/src/styles.css', 'M', 4, 1), file('app/.storybook/preview.ts', 'U', null, null)],
  staged: [file('app/package.json', 'M', 2, 0), file('app/.storybook/main.ts', 'A', 9, 0)],
}

export const manyFiles = (count: number, status: FileChange['status'] = 'M'): FileChange[] =>
  Array.from({ length: count }, (_, i) => file(i === 2 ? LONG_PATH : `app/src/modulos/grupo-${i % 9}/Arquivo${i}.tsx`, status, (i * 7) % 40, (i * 3) % 15))

export const manyWip = (unstaged: number, staged: number): WipStatus => ({ unstaged: manyFiles(unstaged), staged: manyFiles(staged, 'A') })

export const mixedWip: WipStatus = {
  unstaged: [file('app/src/old/Legacy.tsx', 'D', 0, 31), file('app/src/components/Menu.tsx', 'R', 3, 1, 'app/src/components/ContextMenu.tsx'), file('app/assets/logo.png', 'M', null, null), file(LONG_PATH, 'M', 8, 2)],
  staged: [],
}

export const commitDetail = (sha: string): CommitDetail => {
  const node = NODES.find((n) => n.sha === sha) ?? NODES[0]!
  const author = AUTHORS[node.author]!
  const files = [
    file('app/src/components/Graph.tsx', 'M', 14, 6), file('app/src/components/Icon.stories.tsx', 'A', 14, 0), file('app/src/old/Legacy.tsx', 'D', 0, 31),
    file('app/src/components/Menu.tsx', 'R', 3, 1, 'app/src/components/ContextMenu.tsx'),
  ]
  return {
    sha: node.sha, parents: node.parents, author: author.name, email: author.email, timestamp: NOW - node.ago * HOUR, subject: node.subject,
    body: node.description ?? '', files, added: files.reduce((n, f) => n + (f.added ?? 0), 0), removed: files.reduce((n, f) => n + (f.removed ?? 0), 0),
  }
}

type Row = ['=' | '+' | '-', string]

export function diffOf(path: string, rows: Row[], oldPath: string | null = null): FileDiff {
  let oldN = 10
  let newN = 10
  const lines: DiffLine[] = rows.map(([mark, text]) => {
    const line: DiffLine = { kind: mark === '+' ? 'add' : mark === '-' ? 'del' : 'context', old: mark === '+' ? null : oldN, new: mark === '-' ? null : newN, text, noNewline: false, hunk: 0 }
    if (mark !== '+') oldN++
    if (mark !== '-') newN++
    return line
  })
  const added = rows.filter(([m]) => m === '+').length
  const removed = rows.filter(([m]) => m === '-').length
  const context = rows.length - added - removed
  return {
    path, oldPath, binary: false, tooLarge: false, encoding: 'UTF-8', encodingId: 'utf-8', guessed: true, stageable: true, added, removed,
    hunks: [{ header: '@@ -10,' + (context + removed) + ' +10,' + (context + added) + ' @@ export function Graph', oldStart: 10, oldLines: context + removed, newStart: 10, newLines: context + added, start: 0, len: rows.length }],
    lines,
  }
}

export const sampleDiff = (path: string) => diffOf(path, [
  ['=', "import { useEffect, useState } from 'react'"],
  ['=', "import { core } from '../bridge'"],
  ['-', "const ROW = 26"],
  ['+', "const ROW = 28"],
  ['+', "const OVERSCAN = 12"],
  ['=', ''],
  ['=', 'export function Graph({ path }: { path: string }) {'],
  ['-', "  const [page, setPage] = useState(null)"],
  ['+', "  const [page, setPage] = useState<GraphPage | null>(null)"],
  ['=', '  const [loading, setLoading] = useState(false)'],
  ['=', '  useEffect(() => {'],
  ['=', "    void core.graphPage(path, null).then(setPage)"],
  ['=', '  }, [path])'],
  ['=', '  return <div className="graph" />'],
  ['=', '}'],
])

export const conflictFiles: ConflictFile[] = [
  { path: 'app/src/components/Toolbar.tsx', kind: 'both', binary: false },
  { path: 'app/src/store/app.ts', kind: 'both', binary: false },
  { path: 'app/assets/logo.png', kind: 'both', binary: true },
]

export const conflictDoc = (path: string): ConflictDoc => ({
  path,
  finalNewline: true,
  oursLabel: { sha: 'f02b8d4', name: 'feature/storybook' },
  theirsLabel: { sha: 'm01d6f4b', name: 'main' },
  segments: [
    { kind: 'text', lines: ["import { actions, useApp } from '../store/app'", "import { Icon } from './Icon'", ''] },
    { kind: 'conflict', ours: ['export function Toolbar() {', '  const busy = useApp((s) => s.running)'], theirs: ['export function Toolbar({ compact }: { compact?: boolean }) {', '  const busy = useApp((s) => s.running)'], base: ['export function Toolbar() {', '  const busy = useApp((s) => s.running)'], auto: false },
    { kind: 'text', lines: ['  return <header className="toolbar" />', '}'] },
  ],
})

const comment = (id: string, file: string, start: number, body: string, suggestion: string[] | null = null): ReviewComment => ({
  id, file, oldPath: null, lines: { side: 'new', start, end: start }, snippet: ['const ROW = 28'], body, scope: 'round', author: 'reviewer', suggestion,
})

export const reviewState = (concluded = false): ReviewState => ({
  review: {
    branch: 'fix/review-comments',
    rounds: [{
      number: 1, base: 'main', mergeBase: NODES[5]!.sha, from: null, tip: NODES[4]!.sha, startedMs: Date.now() - 2 * 86_400_000, concludedMs: concluded ? Date.now() - 3_600_000 : null,
      reviewed: ['app/src/components/Menu.tsx'],
      comments: [comment('c1', 'app/src/components/Graph.tsx', 12, 'Esse valor deveria vir de graphColumns.', ['const ROW = ROW_HEIGHT'])],
    }],
  },
  files: [
    { ...file('app/src/components/Graph.tsx', 'M', 14, 6), reverted: false },
    { ...file('app/src/components/Menu.tsx', 'M', 3, 1), reverted: false },
    { ...file('app/src/components/Toasts.tsx', 'A', 28, 0), reverted: false },
    { ...file('app/src/components/Legacy.tsx', 'D', 0, 31), reverted: false },
  ],
  status: { tip: NODES[4]!.sha, ahead: 3, rewritten: false, merged: false },
  inbox: '/home/dev/.mnemo/inbox/fix-review-comments',
})

export const reviewSummaries: ReviewSummary[] = [{
  branch: 'fix/review-comments', round: 1, open: true, reviewed: 1, files: 4, status: { tip: NODES[4]!.sha, ahead: 3, rewritten: false, merged: false },
  markers: [],
}]
