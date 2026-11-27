import type { Decorator } from '@storybook/react-vite'
import { actions, DEFAULT_PREFS, useApp, type DiffTarget, type Tab } from '../../store/app'
import type { FileChange } from '../../bridge/types'
import { installMock, mockBackend, resetBackend, withConflicts, withReviews } from './backend'
import { REPO_PATH, SECOND_REPO_PATH, commitDetail, graphCommits, reviewState, wipStatus } from './fixtures'

export { REPO_PATH, SECOND_REPO_PATH, mockBackend, withConflicts, withReviews, reviewState, wipStatus, graphCommits }

export const forever = () => new Promise<never>(() => undefined)
export const failing = (message: string) => () => Promise.reject(new Error(message))

export function resetApp() {
  installMock()
  resetBackend()
  try { localStorage.clear() } catch { /* sem storage */ }
  useApp.setState(useApp.getInitialState(), true)
  useApp.setState({ git: { phase: 'ok', version: '2.45.2' }, prefs: { ...DEFAULT_PREFS, gravatar: false, autoFetchMinutes: 0 } })
}

export const openRepo = async (path = REPO_PATH) => { await actions.openRepository(path) }

export const openTwoRepos = async () => {
  await openRepo(SECOND_REPO_PATH)
  await openRepo(REPO_PATH)
}

export const patchTabs = (patch: (tab: Tab) => Partial<Tab>) => useApp.setState((s) => ({ tabs: s.tabs.map((t) => ({ ...t, ...patch(t) })) }))

export const selectCommit = (index: number, path = REPO_PATH) => actions.selectCommit(path, graphCommits[index]!.sha)

export const diffTarget = (file: FileChange, source: DiffTarget['source'], path = REPO_PATH): DiffTarget => ({ path, file, source })

export const openWipDiff = (staged = false, path = REPO_PATH) => {
  const file = (staged ? wipStatus.staged : wipStatus.unstaged)[0]!
  actions.selectCommit(path, 'wip')
  actions.openDiff(diffTarget(file, { kind: staged ? 'staged' : 'unstaged' }, path))
}

export const openCommitDiff = (path = REPO_PATH) => {
  const commit = commitDetail(graphCommits[0]!.sha)
  actions.selectCommit(path, commit.sha)
  actions.openDiff(diffTarget(commit.files[0]!, { kind: 'commit', sha: commit.sha }, path))
}

export const frame = (height: number | string = 560, width: number | string = '100%'): Decorator => (Story) => (
  <div style={{ height, width, display: 'flex', flexDirection: 'column', position: 'relative', overflow: 'hidden', background: 'var(--bg)' }}><Story /></div>
)

export const screen: Decorator = (Story) => (
  <div style={{ height: '100vh', width: '100vw', position: 'relative' }}><Story /></div>
)
