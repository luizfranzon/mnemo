import { beforeEach, test } from 'node:test'
import assert from 'node:assert/strict'
import { actions, DEFAULT_PREFS, useApp } from './app'

const undo = { undo: { enabled: false, label: null, reason: null }, redo: { enabled: false, label: null, reason: null } }
const info = (branch: string) => ({
  path: '/r', name: 'r', head: { kind: 'branch', name: branch, upstream: null }, undo,
  toolbar: { remotes: [], ahead: null, behind: null, lastFetchEpoch: null, stashCount: 0, pullMode: 'merge', progress: null },
})

/** Core falso: a branch atual muda quando o checkout é executado. */
function fakeCore(conflicts: number) {
  const kinds: Record<string, unknown>[] = []
  let branch = 'x'
  Object.assign(globalThis, { window: { __mnemo: {
    invoke: async (cmd: string, args: Record<string, unknown>) => {
      if (cmd === 'checkout_conflict_count') return conflicts
      if (cmd === 'open_repository') return info(branch)
      if (cmd === 'execute_operation') {
        const kind = args.kind as Record<string, unknown>
        kinds.push(kind)
        if (kind.type === 'checkout') branch = kind.target as string
        if (kind.type === 'checkoutWithChanges') branch = kind.target as string
        return { status: 'completed', opId: null, noEffect: null, warnings: [], state: undo }
      }
      return null
    },
    listen: () => () => {},
  } } })
  return kinds
}

beforeEach(() => {
  useApp.setState({ tabs: [{ path: '/r', name: 'r', head: info('x').head, undo, toolbar: info('x').toolbar, authors: [] }] as never, activePath: '/r', running: {}, prefs: DEFAULT_PREFS, checkoutPrompt: null })
})

test('checkoutRef faz pull ff-only depois do checkout quando a branch está atrás do remoto', async () => {
  const kinds = fakeCore(0)
  await actions.checkoutRef('/r', { type: 'checkout', target: 'y' }, 2)
  assert.deepEqual(kinds, [{ type: 'checkout', target: 'y' }, { type: 'pull', strategy: 'ffOnly' }])
})

test('checkoutRef não faz pull quando a branch não está atrás do remoto', async () => {
  const kinds = fakeCore(0)
  await actions.checkoutRef('/r', { type: 'checkout', target: 'y' }, 0)
  assert.deepEqual(kinds, [{ type: 'checkout', target: 'y' }])
})

test('confirmCheckout faz pull ff-only depois do checkout com mudanças quando a branch está atrás do remoto', async () => {
  const kinds = fakeCore(1)
  await actions.checkoutRef('/r', { type: 'checkout', target: 'y' }, 3)
  assert.deepEqual(kinds, [])
  await actions.confirmCheckout('carry')
  assert.deepEqual(kinds, [{ type: 'checkoutWithChanges', target: 'y', remote: null, mode: 'carry' }, { type: 'pull', strategy: 'ffOnly' }])
})
