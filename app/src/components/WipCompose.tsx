import { useState } from 'react'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Dialog, DialogActions } from './Dialog'
import { TextArea, TextField } from './Field'
import { Icon } from './Icon'
import { Spinner } from './Spinner'
import { Tabs } from './Tabs'

export type ComposeTab = 'commit' | 'stash'
export interface CommitOpts { sign: boolean; hooks: boolean; pushAfter: boolean }

const SUMMARY_LIMIT = 72
const TABS = [{ id: 'commit', label: 'Commit', icon: 'commit' }, { id: 'stash', label: 'Stash', icon: 'stash' }] as const

export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

interface Props {
  tab: ComposeTab
  onTab: (tab: ComposeTab) => void
  summary: string
  onSummary: (text: string) => void
  description: string
  onDescription: (text: string) => void
  amend: boolean
  onAmend: (on: boolean) => void
  opts: CommitOpts
  onOpts: (opts: CommitOpts) => void
  busy: boolean
  merging: string | undefined
  why: string | null
  branch: string
  stagedCount: number
  unstagedCount: number
  changed: number
  onCommit: () => void
  onStash: () => void
}

export function WipCompose({ tab, onTab, summary, onSummary, description, onDescription, amend, onAmend, opts, onOpts, busy, merging, why, branch, stagedCount, unstagedCount, changed, onCommit, onStash }: Props) {
  const [optsOpen, setOptsOpen] = useState(false)
  const commit = tab === 'commit'
  const commitLabel = why ?? (merging ? `Concluir ${merging.toLowerCase()}` : stagedCount ? `Commitar ${plural(stagedCount, 'arquivo', 'arquivos')} em ${branch}` : `Emendar o último commit em ${branch}`)
  return <div className="wip-compose">
    <Tabs className="wip-tabs" label="Ação" tabs={TABS} value={tab} onChange={onTab} />
    {commit && <Checkbox className="wip-amend" checked={amend} onChange={onAmend} label="Emendar o último commit (amend)" />}
    <div className="wip-box">
      <div className="wip-summary">
        <TextField id="wip-sum" label="Resumo" hideLabel value={summary} placeholder={commit ? 'Resumo' : 'Mensagem do stash (opcional)'} onChange={(e) => onSummary(e.target.value)} />
        {commit && <span title="Limite recomendado de 72 caracteres" className="wip-count" style={summary.length > SUMMARY_LIMIT ? { color: 'var(--warning-text)' } : undefined}>{summary.length}/{SUMMARY_LIMIT}</span>}
      </div>
      {commit && <TextArea id="wip-desc" label="Descrição" hideLabel rows={3} placeholder="Descrição (opcional)" value={description} onChange={(e) => onDescription(e.target.value)} />}
    </div>
    {commit && <button className="wip-options" type="button" aria-expanded={optsOpen} onClick={() => setOptsOpen((v) => !v)}>
      <Icon name={optsOpen ? 'chevronDown' : 'chevron'} size={12} strokeWidth={2} />Opções<span>· assinar: {opts.sign ? 'sim' : 'não'} · hooks: {opts.hooks ? 'sim' : 'não'} · push depois: {opts.pushAfter ? 'sim' : 'não'}</span></button>}
    {commit && optsOpen && <div className="wip-opts">
      <Checkbox checked={opts.sign} onChange={(sign) => onOpts({ ...opts, sign })} label="Assinar o commit" />
      <Checkbox checked={opts.hooks} onChange={(hooks) => onOpts({ ...opts, hooks })} label="Rodar hooks" />
      <Checkbox checked={opts.pushAfter} onChange={(pushAfter) => onOpts({ ...opts, pushAfter })} label="Fazer push depois do commit" />
    </div>}
    <div className="wip-buttons">
      {commit
        ? <Button success className="wip-commit" disabled={!!why || busy} aria-busy={busy} title={why ?? undefined} onClick={onCommit}>
          {busy ? <Spinner label={merging ? 'Concluindo…' : 'Commitando…'} /> : commitLabel}
          {!why && !busy && <kbd>Ctrl Enter</kbd>}</Button>
        : <Button success className="wip-commit" disabled={!changed || busy} aria-busy={busy} title={changed ? undefined : 'Não há mudanças para guardar'} onClick={onStash}>
          {busy ? <Spinner label="Guardando…" /> : <>Guardar {plural(changed, 'arquivo', 'arquivos')} no stash<kbd>Ctrl Enter</kbd></>}</Button>}
    </div>
    {commit && unstagedCount > 0 && stagedCount > 0 &&
      <p>{unstagedCount === 1 ? '1 arquivo não preparado fica' : `${unstagedCount} arquivos não preparados ficam`} de fora deste commit.</p>}
  </div>
}

export function StashConfirm({ paths, close, confirm }: { paths: string[]; close: () => void; confirm: () => void }) {
  const one = paths.length === 1
  return <Dialog titleId="stash-confirm-title" onCancel={close}>
    <h2 id="stash-confirm-title">Guardar {one ? paths[0] : `${paths.length} itens`} no stash?</h2>
    <p>Todas as mudanças, preparadas e não preparadas, {one ? 'deste item' : 'destes itens'} vão para um stash novo. O resto do WIP fica como está.</p>
    {!one && <ul className="dialog-list">{paths.slice(0, 8).map((p) => <li key={p}>{p}</li>)}{paths.length > 8 && <li className="muted">e mais {paths.length - 8}</li>}</ul>}
    <p className="muted">Com arquivo em conflito no repositório o git não guarda nada: resolva o conflito antes. Dá para recuperar com Desfazer.</p>
    <DialogActions>
      <Button onClick={close}>Cancelar</Button>
      <Button primary autoFocus onClick={confirm}>Guardar no stash</Button>
    </DialogActions>
  </Dialog>
}
