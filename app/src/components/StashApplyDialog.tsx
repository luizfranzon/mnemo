import { useVirtualizer } from '@tanstack/react-virtual'
import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { FileChange } from '../bridge/types'
import { actions } from '../store/app'
import { fileRows, filesUnder } from './fileTree'

const ROW = 26

/** Aplicar só arquivos ou pastas de um stash ("Apply stashed file/folder"): traz para o diretório de trabalho, sem preparar. */
export function StashApplyDialog({ path, index, name, close }: { path: string; index: number; name: string; close: () => void }) {
  const ref = useRef<HTMLDialogElement>(null)
  const scroller = useRef<HTMLDivElement>(null)
  const [files, setFiles] = useState<FileChange[] | null>(null)
  const [picked, setPicked] = useState<Set<string>>(new Set())
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set())
  useEffect(() => {
    const element = ref.current
    element?.showModal()
    return () => element?.close()
  }, [])
  useEffect(() => {
    let active = true
    void core.stashFiles(path, index).then((list) => { if (active) setFiles([...list].sort((a, b) => a.path.localeCompare(b.path))) },
      (err) => { if (active) { actions.reportError(err); close() } })
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
  return <dialog ref={ref} className="push-dialog card stash-apply" aria-labelledby="stash-apply-title" onCancel={close}>
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
                onClick={() => setCollapsed((old) => { const next = new Set(old); if (open) next.add(row.key); else next.delete(row.key); return next })}>{open ? '▾' : '▸'}</button>
              <label><input type="checkbox" checked={all} ref={(el) => { if (el) el.indeterminate = !all && inside.some((p) => picked.has(p)) }}
                onChange={(e) => setMany(inside, e.target.checked)} /> <strong>{row.name}/</strong> <span className="muted">{row.count}</span></label>
            </div>
          }
          return <div key={row.key} className="stash-apply-row" style={style}>
            <label><input type="checkbox" checked={picked.has(row.file.path)} onChange={(e) => setMany([row.file.path], e.target.checked)} />
              <span className={`commit-status ${row.file.status === 'A' ? 'added' : row.file.status === 'D' ? 'removed' : 'modified'}`}>
                {row.file.status === 'A' ? '+' : row.file.status === 'D' ? '−' : '✎'}</span> {row.name}</label>
          </div>
        })}
      </div>}
    </div>
    <div className="actions">
      <button onClick={close}>Cancelar</button>
      <button className="primary" disabled={!picked.size} onClick={apply}>
        {picked.size ? `Aplicar ${picked.size} ${picked.size === 1 ? 'arquivo' : 'arquivos'}` : 'Escolha arquivos'}</button>
    </div>
  </dialog>
}
