import { useEffect, useState } from 'react'
import { core } from '../bridge'
import type { RepositoryInfo } from '../bridge/types'
import { actions, runningLabel, submodulePath, useApp } from '../store/app'
import { Icon, type IconName } from './Icon'

/** Branch, fetch, pull e push de um submódulo sem sair do repositório pai. O submódulo não vira aba: só a sessão dele no core. */
export function SubmoduleCard({ parent, name }: { parent: string; name: string }) {
  const sub = submodulePath(parent, name)
  const running = useApp((s) => runningLabel(s, sub))
  const [info, setInfo] = useState<RepositoryInfo | null | 'empty'>(null)
  useEffect(() => {
    if (running) return
    let active = true
    void core.openRepository(sub).then(
      // pasta vazia (submódulo não iniciado): o git sobe até o repositório pai
      (next) => { if (active) setInfo(next.path.replace(/\\/g, '/') === parent.replace(/\\/g, '/') ? 'empty' : next) },
      () => { if (active) setInfo('empty') })
    return () => { active = false }
  }, [sub, parent, running])

  if (info === 'empty') return <div className="submodule-card idle">Não iniciado: abra o submódulo para iniciar</div>
  if (!info) return <div className="submodule-card" />
  const { head, toolbar } = info
  const busy = !!running
  const label = head.kind === 'branch' ? head.name : `HEAD ${head.sha}`
  const push = () => {
    if (head.kind !== 'branch') return
    if (head.upstream) return void actions.execute(sub, { type: 'push', remote: null, branch: null, setUpstream: false })
    const remote = toolbar.remotes.includes('origin') ? 'origin' : toolbar.remotes.length === 1 ? toolbar.remotes[0] : undefined
    if (!remote) return actions.reportError(new Error(`${name}: escolha o remoto abrindo o submódulo numa aba`), sub)
    void actions.execute(sub, { type: 'push', remote, branch: head.name, setUpstream: true })
  }
  const pull = () => void actions.execute(sub, { type: 'pull', strategy: toolbar.pullMode === 'rebase' || toolbar.pullMode === 'ffOnly' ? toolbar.pullMode : 'merge' })
  const spinning = (op: string) => !!running?.toLowerCase().includes(op)
  const sync = (op: 'fetch' | 'pull' | 'push', title: string, icon: IconName, run: () => void, count?: number | null, disabled = false) =>
    <button className={`sub-btn ${op}`} disabled={busy || disabled} title={title} aria-label={title} onClick={run}>
      <Icon name={spinning(op) ? 'refresh' : icon} size={14} spin={spinning(op)} />{!!count && <span className="sub-count">{count}</span>}
    </button>
  return <div className="submodule-card">
    <button className={`sub-branch${head.kind === 'detached' ? ' detached' : ''}`} disabled={busy} title={`Trocar de branch em ${name}`} aria-haspopup="dialog" onClick={() => actions.setPalette('checkout', null, sub)}>
      <Icon name="branch" size={12} /><span>{label}</span><Icon name="chevronDown" size={11} />
    </button>
    {sync('fetch', 'Fetch', 'refresh', () => void actions.execute(sub, { type: 'fetch', remote: null }))}
    {sync('pull', toolbar.behind ? `Pull (${toolbar.behind} para baixar)` : 'Pull', 'arrowDown', pull, toolbar.behind)}
    {sync('push', toolbar.ahead ? `Push (${toolbar.ahead} para enviar)` : 'Push', 'arrowUp', push, toolbar.ahead, head.kind !== 'branch')}
  </div>
}
