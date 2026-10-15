import { useEffect, useRef, useState } from 'react'
import { core } from '../bridge'
import type { ConflictChoice, ConflictDoc, ConflictFile } from '../bridge/types'
import { actions, selectConflict, selectWipRevision, useApp } from '../store/app'
import { conflictsOf, initialPicks, output, takeSide, unresolved, type Pick } from './conflictModel'

const CONTEXT = 3
const KIND: Record<ConflictFile['kind'], string> = {
  both: 'modificado nos dois lados', bothAdded: 'adicionado nos dois lados', deletedByUs: 'apagado no Atual e modificado no que entra',
  deletedByThem: 'modificado no Atual e apagado no que entra', addedByUs: 'adicionado no Atual', addedByThem: 'adicionado no que entra', bothDeleted: 'apagado nos dois lados',
}

/** Resolve um arquivo em conflito (Conflito.dc.html): Atual × Entrando por trecho/linha, Resultado editável. */
export function ConflictEditor({ path }: { path: string }) {
  const target = useApp(selectConflict(path))
  const revision = useApp(selectWipRevision(path))
  const file = target?.file ?? ''
  const [info, setInfo] = useState<ConflictFile | null>(null)
  const [doc, setDoc] = useState<ConflictDoc | null>(null)
  const [picks, setPicks] = useState<Pick[]>([])
  const [manual, setManual] = useState<string | null>(null)
  const [current, setCurrent] = useState(0)
  const [ask, setAsk] = useState(false)
  const body = useRef<HTMLDivElement>(null)
  const dialog = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    let active = true
    setInfo(null); setDoc(null); setManual(null); setCurrent(0)
    void core.conflictList(path).then(async (list) => {
      if (!active) return
      const f = list.find((c) => c.path === file) ?? null
      if (!f) return actions.closeConflict() // já resolvido (fora do editor ou por Continuar)
      setInfo(f)
      if (f.binary || (f.kind !== 'both' && f.kind !== 'bothAdded')) return
      const d = await core.conflictFile(path, file)
      if (!active) return
      setDoc(d); setPicks(initialPicks(d))
    }).catch((err) => { if (active) actions.reportError(err) })
    return () => { active = false }
  }, [path, file, revision])

  useEffect(() => {
    if (ask) dialog.current?.showModal()
    else dialog.current?.close()
  }, [ask])

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented || ask || document.querySelector('.menu-overlay, dialog[open], .modal')) return
      actions.closeConflict()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [ask])

  const done = () => { actions.wipChanged(path); actions.closeConflict() }
  const fail = actions.reportError
  const take = (choice: ConflictChoice) => void core.conflictTake(path, file, choice).then(done, fail)
  const save = (markers: boolean) => {
    if (!doc) return
    void core.conflictSave(path, file, manual ?? output(doc, picks, markers), !markers).then(done, fail)
  }
  const chunks = doc ? conflictsOf(doc) : []
  const pending = unresolved(picks)
  const goto = (n: number) => {
    const next = Math.min(Math.max(n, 0), chunks.length - 1)
    setCurrent(next)
    body.current?.querySelector(`[data-chunk="${next}"]`)?.scrollIntoView({ block: 'center' })
  }
  const setPick = (n: number, pick: Pick) => { setManual(null); setPicks((all) => all.map((p, i) => (i === n ? pick : p))) }
  const toggle = (n: number, side: 'ours' | 'theirs', i: number) => {
    const p = picks[n]!
    setPick(n, { ...p, [side]: p[side].map((v, j) => (j === i ? !v : v)), touched: true })
  }

  let chunk = -1
  return <div className="diff-view conflict-view">
    <div className="diff-head">
      <div className="diff-crumb"><span>{file}</span> <span className="diff-side">{info ? KIND[info.kind] : ''}</span></div>
      {chunks.length > 0 && <>
        <button className="diff-nav" aria-label="Conflito anterior" disabled={current <= 0} onClick={() => goto(current - 1)}>‹</button>
        <span className="muted">conflito {current + 1} de {chunks.length}</span>
        <button className="diff-nav" aria-label="Próximo conflito" disabled={current >= chunks.length - 1} onClick={() => goto(current + 1)}>›</button>
      </>}
      <button className="diff-close" aria-label="Fechar editor de conflito (Esc)" title="Fechar (Esc)" onClick={actions.closeConflict}>×</button>
    </div>
    {info && !doc && <div className="conflict-choices">
      <p>{info.binary ? 'Arquivo binário: escolha uma das versões.' : `${file}: ${KIND[info.kind]}.`}</p>
      <div className="actions">
        {info.kind !== 'both' && info.kind !== 'bothAdded' && !info.binary && info.kind !== 'addedByUs' && info.kind !== 'addedByThem' && <button onClick={() => take('base')}>Manter a versão base</button>}
        {info.kind !== 'deletedByUs' && info.kind !== 'addedByThem' && <button onClick={() => take('ours')}>Usar o atual</button>}
        {info.kind !== 'deletedByThem' && info.kind !== 'addedByUs' && <button onClick={() => take('theirs')}>Usar o que entra</button>}
        {!info.binary && <button onClick={() => take('delete')}>Apagar o arquivo</button>}
      </div>
    </div>}
    {doc && <>
      <div className="conflict-body" ref={body}>
        {doc.segments.map((s, k) => {
          if (s.kind === 'text') {
            const L = s.lines
            const headN = k === 0 ? 0 : CONTEXT, tailN = k === doc.segments.length - 1 ? 0 : CONTEXT
            const small = L.length <= headN + tailN
            const head = small ? L : L.slice(0, headN)
            const tail = small ? [] : L.slice(L.length - tailN)
            return <div key={k} className="conflict-text">
              {head.map((t, i) => <div key={i}>{t}</div>)}
              {!small && <div className="muted">… {L.length - headN - tailN} linhas iguais</div>}
              {tail.map((t, i) => <div key={i}>{t}</div>)}
            </div>
          }
          const n = ++chunk
          const p = picks[n]
          if (!p) return null
          return <section key={k} data-chunk={n} className={`conflict-chunk${p.touched ? ' done' : ''}${n === current ? ' current' : ''}`} onClick={() => setCurrent(n)}>
            <div className="conflict-bar">
              <button onClick={() => setPick(n, takeSide(s, true, false))}>Usar o atual</button>
              <button onClick={() => setPick(n, takeSide(s, false, true))}>Usar o que entra</button>
              <button onClick={() => setPick(n, takeSide(s, true, true))}>Os dois</button>
              <button onClick={() => setPick(n, takeSide(s, false, false))}>Nenhum</button>
              {s.auto && <span className="muted">só espaço em branco: Atual escolhido</span>}
            </div>
            <div className="conflict-sides">
              {(['ours', 'theirs'] as const).map((side) => <div key={side} className={`conflict-side ${side}`}>
                <h4>{side === 'ours' ? 'Atual' : 'Entrando'}</h4>
                {s[side].map((t, i) => <label key={i}><input type="checkbox" checked={p[side][i] ?? false} onChange={() => toggle(n, side, i)} /><code>{t || ' '}</code></label>)}
              </div>)}
            </div>
          </section>
        })}
      </div>
      <div className="conflict-result">
        <div className="diff-tools">
          <strong>Resultado</strong>
          <span className="muted">{pending > 0 ? `${pending} sem escolha` : 'todos os conflitos resolvidos'}</span>
          <span className="spacer" />
          <button onClick={() => void core.conflictMergetool(path, file).then(() => actions.wipChanged(path), fail)}>Abrir na ferramenta externa</button>
          <button onClick={() => { setManual(null); setPicks(initialPicks(doc)) }}>Reset</button>
          <button className="primary" onClick={() => (pending > 0 && manual === null ? setAsk(true) : save(false))}>Salvar</button>
        </div>
        <textarea aria-label="Resultado" spellCheck={false} value={manual ?? output(doc, picks, true)} onChange={(e) => setManual(e.target.value)} />
      </div>
      <dialog ref={dialog} className="push-dialog card" aria-labelledby="conflict-ask" onCancel={() => setAsk(false)}>
        <h2 id="conflict-ask">Há {pending} conflito(s) sem escolha</h2>
        <p>Dá para gravar o arquivo com os marcadores <code>&lt;&lt;&lt;&lt;&lt;&lt;&lt;</code> e resolver depois.</p>
        <div className="actions">
          <button onClick={() => setAsk(false)}>Voltar</button>
          <button className="primary" autoFocus onClick={() => { setAsk(false); save(true) }}>Gravar com marcadores</button>
        </div>
      </dialog>
    </>}
  </div>
}
