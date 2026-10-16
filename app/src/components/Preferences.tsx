import { useEffect, useState, type ReactNode } from 'react'
import type { RepoPrefs } from '../bridge/types'
import { actions, selectActiveTab, selectRepoPrefs, useApp, type Prefs } from '../store/app'
import { RadioGroup } from './RadioGroup'
import { Icon } from './Icon'

/** Só entram seções com ajuste real; as demais do mockup chegam com as features (docs/01-features.md § 12). */
export function Preferences() {
  const open = useApp((s) => s.prefsOpen)
  return open && <Screen />
}

type Section = 'general' | 'appearance' | 'repoCommit'

function Screen() {
  const [section, setSection] = useState<Section>('general')
  const repoPath = useApp((s) => selectActiveTab(s)?.path)
  const repoName = useApp((s) => selectActiveTab(s)?.name)
  const repo = repoPath && repoName ? { path: repoPath, name: repoName } : null
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') actions.setPrefsOpen(false) }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
  const item = (id: Section, label: string) =>
    <button className="item" aria-current={section === id ? 'page' : undefined} onClick={() => setSection(id)}>{label}</button>
  const current = section === 'repoCommit' && !repo ? 'general' : section
  return (
    <div className="prefs">
      <nav className="prefs-nav" aria-label="Seções das preferências">
        <button className="back" onClick={() => actions.setPrefsOpen(false)}><Icon name="back" size={14} /> Voltar ao repositório <kbd>Esc</kbd></button>
        <div className="prefs-group">Global</div>
        {item('general', 'Geral')}
        {item('appearance', 'Aparência')}
        {repo && <>
          <div className="prefs-group" title={repo.path}>Repositório: {repo.name}</div>
          {item('repoCommit', 'Commit')}
        </>}
      </nav>
      <main className="prefs-main">
        {current === 'general' ? <General /> : current === 'appearance' ? <Appearance /> : <RepoCommit path={repo!.path} />}
      </main>
    </div>
  )
}

function Check({ pref, label, help }: { pref: { [K in keyof Prefs]: Prefs[K] extends boolean ? K : never }[keyof Prefs]; label: string; help?: ReactNode }) {
  const value = useApp((s) => s.prefs[pref])
  return <>
    <label className="field">
      <input type="checkbox" checked={value} onChange={(e) => actions.setPref(pref, e.target.checked)} />
      {label}
    </label>
    {help && <p className="help">{help}</p>}
  </>
}

const AUTO_FETCH_OPTIONS = [0, 1, 5, 10, 30]

function AutoFetch() {
  const minutes = useApp((s) => s.prefs.autoFetchMinutes)
  return <>
    <label className="field">
      Auto-fetch
      <select value={minutes} onChange={(e) => actions.setPref('autoFetchMinutes', Number(e.target.value))}>
        {AUTO_FETCH_OPTIONS.map((m) => <option key={m} value={m}>{m ? `a cada ${m} min` : 'Desligado'}</option>)}
      </select>
    </label>
    <p className="help">Busca os remotos das abas abertas em segundo plano. Pula quando há uma Operação em andamento.</p>
  </>
}

function General() {
  return <div>
    <h1>Geral</h1>
    <Check pref="rememberTabs" label="Lembrar abas" help="Ao abrir o Mnemo, reabre os repositórios que estavam abertos." />
    <Check pref="prune" label="Auto-prune no fetch" help="Remove as branches remotas que já foram apagadas no remoto (git fetch --prune)." />
    <AutoFetch />
    <Check pref="doubleClickCheckout" label="Duplo clique faz checkout" help="Vale para as branches do grafo e do painel de refs." />
  </div>
}

function Appearance() {
  const initialsOnly = useApp((s) => !s.prefs.gravatar)
  const dateOrder = useApp((s) => s.prefs.dateOrder)
  return <div>
    <h1>Aparência</h1>
    <h2>Grafo</h2>
    <label className="field">
      <input type="checkbox" checked={initialsOnly} onChange={(e) => actions.setPref('gravatar', !e.target.checked)} />
      Iniciais no lugar de avatares
    </label>
    <p className="help">Sem foto do Gravatar e sem nenhum request: o hash do email de cada Autor não é enviado a gravatar.com.</p>
    <Check pref="ghostRefs" label="Mostrar a branch ao passar o mouse ou selecionar um commit"
      help="Commits sem branch própria mostram, apagada, a branch a que pertencem." />
    <h2>Ordem dos commits</h2>
    <RadioGroup name="order" label="Ordem dos commits" value={dateOrder ? 'date' : 'topo'}
      onChange={(v) => actions.setPref('dateOrder', v === 'date')}
      options={[
        { value: 'topo', label: 'Agrupada por branch (topológica)' },
        { value: 'date', label: 'Por data, intercalando branches' },
      ]} />
    <p className="help">A topológica deixa cada branch compacta e com menos cruzamento de linhas. Por data, um commit recente de uma branch pode aparecer acima de merges mais antigos de outras.</p>
  </div>
}

function RepoCommit({ path }: { path: string }) {
  const prefs = useApp(selectRepoPrefs(path))
  useEffect(() => { void actions.loadRepoPrefs(path) }, [path])
  const check = (key: keyof RepoPrefs, label: string) =>
    <label className="field">
      <input type="checkbox" disabled={!prefs} checked={prefs?.[key] ?? false} onChange={(e) => void actions.setRepoPref(path, key, e.target.checked)} />
      {label}
    </label>
  return <div>
    <h1>Commit</h1>
    <p className="help">Padrão das Opções do painel de commit neste repositório. Fica no .git/config, não é commitado.</p>
    {check('pushAfterCommit', 'Fazer push depois de cada commit')}
    {check('skipHooks', 'Pular os hooks do git por padrão')}
    {check('signCommits', 'Assinar commits por padrão')}
    <p className="help">Assinar usa o commit.gpgsign do git, o mesmo que o terminal respeita.</p>
  </div>
}
