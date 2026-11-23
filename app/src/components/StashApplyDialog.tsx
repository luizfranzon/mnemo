import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { FileChange } from '../bridge/types'
import { actions } from '../store/app'
import { Button } from './Button'
import { Checkbox } from './Checkbox'
import { Dialog, DialogActions } from './Dialog'
import { fileRows, filesUnder } from './fileTree'
import { Icon } from './Icon'

const ROW = 26

/** Aplicar só arquivos ou pastas de um stash ("Apply stashed file/folder"): traz para o diretório de trabalho, sem preparar. */
export function StashApplyDialog({ path, index, name, close }: { path: string; index: number; name: string; close: () => void }) {
  const scroller = useRef<HTMLDivElement>(null)
  const [files, setFiles] = useState<FileChange[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  useEffect(() => {
    let active = true
    void core.stashFiles(path, index).then((list) => { if (active) setFiles([...list].sort((a, b) => a.path.localeCompare(b.path))) },
      (err) => { if (active) { actions.reportError(err, path); close() } })
    return () => { active = false }
  }, [path, index])
  const rows = files ? fileRows(files, 'tree', collapsed) : []
  const virtual = useVirtualizer({ count: rows.length, getScrollElement: () => scroller.current, estimateSize: () => ROW, overscan: 10, getItemKey: (i) => rows[i]!.key })
  const setMany = (paths: string[], on: boolean) => setPicked((old) => {
    const next = new Set(old)
    paths.forEach((p) => (on ? next.add(p) : next.delete(p)))
    return next
  })
  const apply = () => {
    close()
    void actions.execute(path, { type: 'stashApplyPaths', index, paths: [...picked] })
  }
  return <Dialog titleId="stash-apply-title" className="stash-apply" onCancel={close}>
    <h2 id="stash-apply-title">Aplicar arquivos de {name}</h2>
    <p className="muted">Os escolhidos voltam ao diretório de trabalho, sem preparar. O stash continua na lista. Mudanças locais neles são substituídas (dá para Desfazer).</p>
    <div className="stash-apply-list" ref={scroller}>
      {files === null ? <p className="muted">Carregando…</p> : <div style={{ height: virtual.getTotalSize(), position: 'relative' }}>
        {virtual.getVirtualItems().map((item) => {
          const row = rows[item.index]!
          const style = { transform: `translateY(${item.start}px)`, height: ROW, paddingLeft: 4 + row.depth * 16 }
          if (row.type === 'dir') {
            const inside = filesUnder(files, row.path).map((f) => f.path)
            const all = inside.every((p) => picked.has(p))
            const open = !collapsed.has(row.key)
            return <div key={row.key} className="stash-apply-row" style={style}>
              <button className="stash-apply-chevron" aria-expanded={open} aria-label={open ? `Recolher ${row.path}` : `Expandir ${row.path}`}
                onClick={() => setCollapsed((old) => { const next = new Set(old); if (open) next.add(row.key); else next.delete(row.key); return next })}><Icon name={open ? 'chevronDown' : 'chevron'} size={14} /></button>
              <Checkbox checked={all} indeterminate={!all && inside.some((p) => picked.has(p))} onChange={(on) => setMany(inside, on)}
                label={<><strong>{row.name}/</strong> <span className="muted">{row.count}</span></>} />
            </div>
          }
          const fileLabel = <>
            <span className={`commit-status ${row.file.status === 'A' ? 'added' : row.file.status === 'D' ? 'removed' : 'modified'}`}>
              <Icon name={row.file.status === 'A' ? 'plus' : row.file.status === 'D' ? 'minus' : 'modified'} size={12} strokeWidth={2.2} /></span> {row.name}
          </>
          return <div key={row.key} className="stash-apply-row" style={style}>
            <Checkbox checked={picked.has(row.file.path)} onChange={(on) => setMany([row.file.path], on)} label={fileLabel} />
          </div>
        })}
      </div>}
    </div>
    <DialogActions>
      <Button onClick={close}>Cancelar</Button>
      <Button primary disabled={!picked.size} onClick={apply}>
        {picked.size ? `Aplicar ${picked.size} ${picked.size === 1 ? 'arquivo' : 'arquivos'}` : 'Escolha arquivos'}</Button>
    </DialogActions>
  </Dialog>
}
