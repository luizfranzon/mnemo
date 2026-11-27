import type { CSSProperties, MouseEvent } from 'react'
import type { ConflictFile, FileChange } from '../bridge/types'
import { Button } from './Button'
import type { TreeRow } from './fileTree'
import { Icon, type IconName } from './Icon'
import { IconButton } from './IconButton'
import type { Rect } from './menuModel'

const GLYPH: Record<string, { icon: IconName; color: string }> = {
  A: { icon: 'plus', color: '#7FDC95' }, M: { icon: 'modified', color: '#F0C06A' }, T: { icon: 'modified', color: '#F0C06A' },
  D: { icon: 'minus', color: '#F0877F' }, R: { icon: 'renamed', color: '#7FB0F0' }, C: { icon: 'copy', color: '#7FB0F0' },
}

export type WipRow = { type: 'head'; key: string; staged: boolean; count: number; open: boolean; filtered: boolean } | (TreeRow<FileChange> & { staged: boolean })
export type WipFileRowData = Extract<WipRow, { type: 'file' }>
export type WipDirRowData = Extract<WipRow, { type: 'dir' }>

export const pointOf = (e: MouseEvent): Rect => ({ left: e.clientX, right: e.clientX, top: e.clientY, bottom: e.clientY })

export function WipSectionHead({ staged, count, open, filtered, style, onToggle, onStageAll }: {
  staged: boolean; count: number; open: boolean; filtered: boolean; style: CSSProperties; onToggle: () => void; onStageAll: () => void
}) {
  const verb = staged ? 'Tirar' : 'Preparar'
  return <div className={staged ? 'wip-section staged' : 'wip-section'} style={style}>
    <IconButton className="wip-section-chevron" icon={open ? 'chevronDown' : 'chevron'} size={12} strokeWidth={2} aria-expanded={open}
      label={`${open ? 'Recolher' : 'Expandir'} ${staged ? 'preparados' : 'não preparados'}`} onClick={onToggle} />
    <span className="wip-section-name">{staged ? 'Preparados' : 'Não preparados'} <span>{count}</span></span>
    <Button small tinted={!staged} disabled={!count} onClick={onStageAll}>{filtered ? `${verb} ${count} filtrados` : `${verb} todos`}</Button>
  </div>
}

export function WipDirRow({ row, open, style, onToggle, onContextMenu, onMenu, onStage }: {
  row: WipDirRowData
  open: boolean
  style: CSSProperties
  onToggle: () => void
  onContextMenu: (e: MouseEvent) => void
  onMenu: (at: Rect) => void
  onStage: () => void
}) {
  return <div className="wip-file wip-dir" style={{ ...style, paddingLeft: 10 + row.depth * 14 }} onContextMenu={onContextMenu}>
    <button className="wip-dir-toggle" aria-expanded={open} onClick={onToggle}>
      <span className="wip-glyph"><Icon name={open ? 'chevronDown' : 'chevron'} size={13} /></span><span className="wip-name">{row.name}</span><span className="wip-count-dir">{row.count}</span></button>
    <span className="wip-actions">
      <IconButton className="wip-icon" icon="more" size={14} label={`Ações da pasta ${row.path}`} title="Ações da pasta" onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())} />
      <Button small tinted={!row.staged} onClick={onStage}>{row.staged ? 'Tirar pasta' : 'Preparar pasta'}</Button>
    </span>
  </div>
}

export function WipFileRow({ row, paths, selected, active, style, onClick, onContextMenu, onMenu, onDiscard, onStage }: {
  row: WipFileRowData
  paths: string[]
  selected: boolean
  active: boolean
  style: CSSProperties
  onClick: (e: MouseEvent) => void
  onContextMenu: (e: MouseEvent) => void
  onMenu: (at: Rect) => void
  onDiscard: () => void
  onStage: () => void
}) {
  const { file } = row
  const g = GLYPH[file.status] ?? GLYPH.M!
  const many = paths.length > 1
  const cls = `wip-file${selected ? ' selected' : ''}${active ? ' active' : ''}`
  return <div className={cls} style={{ ...style, paddingLeft: 10 + row.depth * 14 }} title={file.oldPath ? `${file.oldPath} → ${file.path}` : file.path}
    role="button" tabIndex={0} aria-pressed={selected} data-key={row.key} onClick={onClick}
    onKeyDown={(e) => { if (e.target === e.currentTarget && e.key === 'Enter') { e.preventDefault(); e.currentTarget.click() } }}
    onContextMenu={onContextMenu}>
    <span className="wip-glyph" style={{ color: g.color }}><Icon name={g.icon} size={12} strokeWidth={2.2} /></span>
    <span className="wip-path"><span className="wip-name">{row.name}</span></span>
    {file.added !== null && <span className="wip-lines"><span style={{ color: '#7FDC95' }}>+{file.added}</span> <span style={{ color: '#F0877F' }}>−{file.removed}</span></span>}
    <span className="wip-actions" onClick={(e) => e.stopPropagation()}>
      <IconButton className="wip-icon" icon="more" size={14} label={`Ações de ${file.path}`} title="Mais ações" onClick={(e) => onMenu(e.currentTarget.getBoundingClientRect())} />
      {!row.staged && <IconButton className="wip-danger" icon="undo" size={13} strokeWidth={2} onClick={onDiscard}
        title={many ? `Descartar mudanças dos ${paths.length} selecionados` : 'Descartar mudanças deste arquivo'}
        label={`Descartar ${many ? `${paths.length} arquivos` : file.path}`} />}
      <Button small tinted={!row.staged} onClick={onStage}>
        {row.staged ? 'Tirar' : 'Preparar'}{many ? ` ${paths.length}` : ''}</Button>
    </span>
  </div>
}

export function WipConflicts({ conflicts, active, onOpen, onResolve }: { conflicts: ConflictFile[]; active: string | null; onOpen: (path: string) => void; onResolve: (paths: string[]) => void }) {
  return <div className="wip-conflicts">
    <h3>Conflitos <span>{conflicts.length}</span>
      <Button small title="Marca todos como resolvidos com o conteúdo atual do disco" onClick={() => onResolve(conflicts.map((c) => c.path))}>Marcar todos resolvidos</Button></h3>
    {conflicts.map((c) => <div key={c.path} className={c.path === active ? 'conflict-file active' : 'conflict-file'} title={c.path} onClick={() => onOpen(c.path)}>
      <span>{c.path}</span>
      <Button small onClick={(e) => { e.stopPropagation(); onResolve([c.path]) }}>Marcar como resolvido</Button>
    </div>)}
  </div>
}
