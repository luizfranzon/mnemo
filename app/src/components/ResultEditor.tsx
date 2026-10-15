import { defaultKeymap, history, historyKeymap } from '@codemirror/commands'
import { Annotation, EditorState, RangeSetBuilder, StateEffect, StateField } from '@codemirror/state'
import { Decoration, EditorView, GutterMarker, ViewPlugin, WidgetType, gutter, keymap, lineNumbers, type DecorationSet, type ViewUpdate } from '@codemirror/view'
import { useEffect, useRef, type RefObject } from 'react'
import { highlight } from './diffModel'
import type { ResultLayout } from './conflictModel'

export interface ResultHandle { reveal: (line: number) => void }

const external = Annotation.define<boolean>()
const setLayout = StateEffect.define<ResultLayout | null>()

class Pending extends WidgetType {
  toDOM() { const el = document.createElement('div'); el.className = 'cm-nochoice'; el.textContent = 'sem escolha'; return el }
}

/** Origem de cada linha (fundo e letra na calha). Editar à mão apaga: o mapeamento linha → trecho deixa de valer. */
const layoutField = StateField.define<ResultLayout | null>({
  create: () => null,
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setLayout)) return e.value
    return tr.docChanged && !tr.annotation(external) ? null : value
  },
  provide: (f) => EditorView.decorations.compute([f], (state) => {
    const lay = state.field(f)
    const b = new RangeSetBuilder<Decoration>()
    if (!lay) return b.finish()
    const total = state.doc.lines
    const empties = new Map(lay.empties.map((e) => [e.before, e]))
    for (let n = 0; n <= lay.lines.length && n < total + 1; n++) {
      if (empties.has(n) && n < total) b.add(state.doc.line(n + 1).from, state.doc.line(n + 1).from, Decoration.widget({ widget: new Pending(), block: true, side: -1 }))
      const l = lay.lines[n]
      if (l && l.origin !== 'text' && n < total) b.add(state.doc.line(n + 1).from, state.doc.line(n + 1).from, Decoration.line({ class: `cm-${l.origin}` }))
    }
    return b.finish()
  }),
})

class Letter extends GutterMarker {
  constructor(readonly c: string) { super() }
  toDOM() { return document.createTextNode(this.c) }
  eq(o: Letter) { return o.c === this.c }
}
const [A, B] = [new Letter('A'), new Letter('B')]
const origins = gutter({
  class: 'cm-origin',
  lineMarker(view, line) {
    const lay = view.state.field(layoutField)
    const o = lay?.lines[view.state.doc.lineAt(line.from).number - 1]?.origin
    return o === 'ours' ? A : o === 'theirs' ? B : null
  },
  lineMarkerChange: (u) => u.transactions.some((t) => t.effects.some((e) => e.is(setLayout))) || u.docChanged,
})

/** Mesmo highlight genérico do diff (`highlight`), só nas linhas visíveis. */
const syntax = ViewPlugin.fromClass(class {
  decorations: DecorationSet
  constructor(view: EditorView) { this.decorations = this.build(view) }
  update(u: ViewUpdate) { if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view) }
  build(view: EditorView) {
    const b = new RangeSetBuilder<Decoration>()
    for (const { from, to } of view.visibleRanges) {
      for (let pos = from; pos <= to;) {
        const line = view.state.doc.lineAt(pos)
        let at = line.from
        for (const p of highlight(line.text)) {
          if (p.c !== 'default') b.add(at, at + p.t.length, Decoration.mark({ class: `syn-${p.c}` }))
          at += p.t.length
        }
        pos = line.to + 1
      }
    }
    return b.finish()
  }
}, { decorations: (v) => v.decorations })

interface Props { value: string; layout: ResultLayout | null; onChange: (text: string) => void; handle: RefObject<ResultHandle | null> }

/** Resultado editável (ADR 0006). `value` e `layout` mandam; digitar chama `onChange`. */
export function ResultEditor({ value, layout, onChange, handle }: Props) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const change = useRef(onChange)
  change.current = onChange

  useEffect(() => {
    const v = new EditorView({
      parent: host.current!,
      state: EditorState.create({
        doc: value,
        extensions: [
          lineNumbers(), origins, layoutField, syntax, history(), keymap.of([...defaultKeymap, ...historyKeymap]),
          EditorView.contentAttributes.of({ 'aria-label': 'Resultado', spellcheck: 'false' }),
          EditorView.updateListener.of((u) => { if (u.docChanged && !u.transactions.some((t) => t.annotation(external))) change.current(u.state.doc.toString()) }),
        ],
      }),
    })
    view.current = v
    handle.current = { reveal: (line) => { const pos = v.state.doc.line(Math.min(line + 1, v.state.doc.lines)).from; v.dispatch({ effects: EditorView.scrollIntoView(pos, { y: 'center' }) }) } }
    return () => { v.destroy(); view.current = null; handle.current = null }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- criado uma vez; `value`/`layout` entram pelo efeito abaixo
  }, [])

  useEffect(() => {
    const v = view.current
    if (!v) return
    const same = v.state.doc.toString() === value
    v.dispatch({
      changes: same ? undefined : { from: 0, to: v.state.doc.length, insert: value },
      effects: setLayout.of(layout),
      annotations: external.of(true),
    })
  }, [value, layout])

  return <div className="result-editor" ref={host} />
}
