import type { ExecuteResult, UndoRedoState } from '../../bridge/types'
import {
  AUTHORS, REPO_PATH, SECOND_REPO_PATH, SUBMODULE_NAME, branches, commitDetail, conflictDoc, conflictFiles, graphPage, refListing, repoInfo, reviewState,
  reviewSummaries, sampleDiff, undoIdle, wipStatus,
} from './fixtures'

type Args = Record<string, unknown>
type Handler = (args: Args) => unknown

const completed = (state: UndoRedoState = undoIdle): ExecuteResult => ({ status: 'completed', opId: 1, label: 'operação simulada', noEffect: null, undoable: true, warnings: [], state })
const pathOf = (args: Args) => String(args.path ?? REPO_PATH)

const nameOf = (path: string) => path.split('/').filter(Boolean).at(-1) ?? path

const defaults: Record<string, Handler> = {
  check_git: () => ({ version: '2.45.2' }),
  initial_paths: () => [],
  pick_folder: () => REPO_PATH,
  update_state: () => ({ status: 'none' }),
  update_check: () => ({ status: 'none' }),
  update_download: () => ({ status: 'downloading', version: '0.6.0', percent: 40 }),
  update_install: () => null,
  open_repository: (args) => {
    const path = pathOf(args)
    const info = repoInfo(path, nameOf(path))
    if (path.endsWith(SUBMODULE_NAME)) return { ...info, head: { kind: 'branch', name: 'main', upstream: 'origin/main' }, toolbar: { ...info.toolbar, behind: 2, ahead: 0 } }
    return info
  },
  close_repository: () => null,
  watch_repository: () => null,
  list_branches: () => branches,
  list_remote_branches: () => [{ remote: 'origin', name: 'main' }, { remote: 'origin', name: 'feature/storybook' }],
  list_authors: () => AUTHORS,
  list_refs: () => refListing,
  checkout_conflict_count: () => 0,
  graph_page: () => graphPage(),
  wip_status: () => wipStatus,
  stage: () => null,
  unstage: () => null,
  stage_lines: () => null,
  file_diff: (args) => sampleDiff(String(args.file ?? 'app/src/components/Graph.tsx')),
  list_encodings: () => [
    { id: 'utf-8', label: 'UTF-8', group: 'Unicode' }, { id: 'utf-16le', label: 'UTF-16 LE', group: 'Unicode' },
    { id: 'windows-1252', label: 'Windows-1252', group: 'Europa Ocidental' }, { id: 'iso-8859-1', label: 'ISO-8859-1', group: 'Europa Ocidental' },
  ],
  conflict_list: () => [],
  conflict_file: (args) => conflictDoc(String(args.file)),
  conflict_save: () => null,
  conflict_take: () => null,
  conflict_reopen: () => null,
  conflict_mergetool: () => null,
  stash_files: () => wipStatus.unstaged.concat(wipStatus.staged),
  ignore: () => null,
  commit_detail: (args) => commitDetail(String(args.sha)),
  push_force_preview: () => ({ remote: 'origin', branch: 'feature/storybook', remoteBranch: 'origin/feature/storybook', sha: 'f02b8d4f6c8e1a3c5e7a9c1e3b5d7f9a1c3e5b71', lost: 2 }),
  commit_on_remote: () => true,
  remote_url: () => 'https://github.com/exemplo/mnemo.git',
  execute_operation: () => completed(),
  reset_preview: () => ({ trackedChanges: 3, untrackedFiles: 1, untrackedBytes: 2048, exceedsLimit: false, commits: 2 }),
  discard_preview: () => ({ trackedChanges: 3, untrackedFiles: 1, untrackedBytes: 2048, exceedsLimit: false }),
  restore_discard_as_copies: () => ['app/src/components/Palette.tsx'],
  undo: () => undoIdle,
  redo: () => undoIdle,
  sync_external: () => undoIdle,
  auto_fetch: () => false,
  maintenance: () => null,
  refresh_external: () => null,
  open_file: () => null,
  set_pull_mode: (args) => ({ ...repoInfo(pathOf(args), 'mnemo').toolbar, pullMode: args.mode }),
  repo_prefs: () => ({ pushAfterCommit: false, skipHooks: false, signCommits: false }),
  set_repo_pref: () => ({ pushAfterCommit: false, skipHooks: false, signCommits: false }),
  abort_in_progress: () => undoIdle,
  continue_in_progress: () => completed(),
  skip_in_progress: () => completed(),
  review_list: () => [],
  review_base: () => 'main',
  review_fetch: () => null,
  review_start: () => reviewState(),
  review_open: () => reviewState(),
  review_mark: () => reviewState().review,
  review_comment: () => reviewState().review,
  review_uncomment: () => reviewState().review,
  review_conclude: () => reviewState(true).review,
  review_end: () => null,
  save_text: () => '/home/dev/relatorio.md',
  window_action: () => null,
}

let overrides: Record<string, Handler> = {}

export function mockBackend(patch: Record<string, Handler>) {
  overrides = { ...overrides, ...patch }
}

export function resetBackend() {
  overrides = {}
}

export function installMock() {
  window.__mnemo = {
    invoke: async (cmd, args) => {
      const handler = overrides[cmd] ?? defaults[cmd]
      if (!handler) return null
      return handler(args)
    },
    listen: () => () => undefined,
  }
}

export const withConflicts = () => mockBackend({ conflict_list: () => conflictFiles })
export const withReviews = () => mockBackend({ review_list: () => reviewSummaries })
export { SECOND_REPO_PATH }
