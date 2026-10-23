// Revisão: relatório, âncora dos comentários e onde eles entram no diff. Funções puras: os componentes só desenham.
import type { FileDiff, Review, ReviewComment, ReviewFile, ReviewRound, ReviewScope, ReviewSummary } from '../bridge/types'
import type { DiffRow } from './diffModel'
import type { MenuEntry } from './menuModel'

/** Comentário sendo escrito: novo (`id` nulo) ou edição. `end` é o índice em `diff.lines` da última linha; `null` = arquivo inteiro. */
export interface Draft { id: string | null; end: number | null; side: 'old' | 'new' }

export const lineLabel = (lines: ReviewComment['lines']) => {
  if (!lines) return 'Arquivo inteiro'
  const range = lines.start === lines.end ? `L${lines.start}` : `L${lines.start}–${lines.end}`
  return lines.side === 'old' ? `${range} (removido)` : range
}

/** Número da linha no lado do comentário (`null` = a linha não existe nesse lado). */
const numberOn = (diff: FileDiff, i: number, side: 'old' | 'new') => (side === 'new' ? diff.lines[i]?.new : diff.lines[i]?.old) ?? null

/**
 * Âncora e cópia do trecho escolhido (`from`..`to`, índices em `diff.lines`). `side` vem do lado clicado no lado a lado;
 * no diff unificado, só remoções ancoram no lado antigo. Trecho que mistura remoção e adição guarda as marcas `-`/`+`.
 */
export function anchorOf(diff: FileDiff, from: number, to: number, side?: 'old' | 'new'): Pick<ReviewComment, 'lines' | 'snippet'> | null {
  const [a, b] = [Math.min(from, to), Math.max(from, to)]
  const picked = diff.lines.slice(a, b + 1)
  const s = side ?? (picked.every((l) => l.kind === 'del') ? 'old' : 'new')
  const onSide = picked.filter((l) => (s === 'new' ? l.new : l.old) !== null)
  if (!onSide.length) return null
  const nums = onSide.map((l) => (s === 'new' ? l.new : l.old)!)
  const mixed = side === undefined && picked.some((l) => l.kind === 'add') && picked.some((l) => l.kind === 'del')
  const snippet = (mixed ? picked : onSide).map((l) => {
    const text = l.text.endsWith('\r') ? l.text.slice(0, -1) : l.text
    return mixed ? `${l.kind === 'add' ? '+' : l.kind === 'del' ? '-' : ' '} ${text}` : text
  })
  return { lines: { side: s, start: Math.min(...nums), end: Math.max(...nums) }, snippet }
}

/** Comentários deste arquivo que este diff mostra: no lado novo valem nos dois recortes (é o mesmo arquivo); no antigo, só no recorte em que foram feitos. */
export const visibleComments = (comments: ReviewComment[], file: string, scope: ReviewScope) =>
  comments.filter((c) => c.file === file && (!c.lines || c.lines.side === 'new' || c.scope === scope))

/** Insere comentários e a caixa de escrever nas linhas do diff. Comentário cuja linha não aparece (fora dos trechos) fica de fora. */
export function reviewRows(rows: DiffRow[], diff: FileDiff, comments: ReviewComment[], draft: Draft | null): DiffRow[] {
  const rowOf = (i: number, side: 'old' | 'new') => rows.findIndex((r) => r.type === 'line' ? r.line === i : r.type === 'split' && (side === 'new' ? r.right === i : r.left === i))
  const after = new Map<number, DiffRow[]>()
  const push = (at: number, row: DiffRow) => after.set(at, [...(after.get(at) ?? []), row])
  const editing = draft?.id ?? null
  for (const c of comments) {
    if (c.id === editing) continue
    if (!c.lines) { push(-1, { type: 'comment', key: `c${c.id}`, id: c.id }); continue }
    const line = diff.lines.findIndex((_, i) => numberOn(diff, i, c.lines!.side) === c.lines!.end)
    const at = line < 0 ? -1 : rowOf(line, c.lines.side)
    if (at >= 0) push(at, { type: 'comment', key: `c${c.id}`, id: c.id })
  }
  if (draft) {
    const at = draft.end === null ? -1 : rowOf(draft.end, draft.side)
    push(draft.end === null || at >= 0 ? at : -1, { type: 'composer', key: 'composer' })
  }
  const out: DiffRow[] = [...(after.get(-1) ?? [])]
  rows.forEach((r, i) => { out.push(r, ...(after.get(i) ?? [])) })
  return out
}

/** Próximo arquivo a revisar depois de `current`, dando a volta na lista. Revisado e revertido não contam. */
export function nextFile(files: ReviewFile[], reviewed: string[], current: string | null): ReviewFile | null {
  const pending = (f: ReviewFile) => !f.reverted && !reviewed.includes(f.path) && f.path !== current
  const at = files.findIndex((f) => f.path === current)
  return [...files.slice(at + 1), ...files.slice(0, at + 1)].find(pending) ?? null
}

/** Diff que a Rodada mostra no recorte escolhido. A primeira Rodada só tem um. */
export const rangeOf = (round: ReviewRound, scope: ReviewScope) => ({ from: scope === 'branch' || !round.from ? round.mergeBase : round.from, to: round.tip })

const short = (sha: string) => sha.slice(0, 7)
const date = (ms: number) => new Date(ms).toLocaleDateString('pt-BR')
/** Cerca maior que qualquer sequência de crases do trecho, para o bloco não fechar antes da hora. */
const fence = (lines: string[]) => '`'.repeat(Math.max(3, ...lines.map((l) => (l.match(/`+/g) ?? []).reduce((m, s) => Math.max(m, s.length + 1), 0))))

/** Relatório da Rodada em Markdown: arquivo, trecho e comentário, na ordem da árvore e das linhas. */
export function reviewReport(review: Review, round: ReviewRound, files: ReviewFile[]): string {
  const { from, to } = rangeOf(round, 'round')
  const out = [`# Revisão de ${review.branch} → ${round.base} (rodada ${round.number})`, `${short(from)}..${short(to)} · ${date(round.concludedMs ?? round.startedMs)}`]
  const byFile = new Map<string, ReviewComment[]>()
  for (const c of round.comments) byFile.set(c.file, [...(byFile.get(c.file) ?? []), c])
  if (!byFile.size) return [...out, '', 'Nenhum comentário nesta rodada.', ''].join('\n')
  const order = (c: ReviewComment) => (c.lines ? c.lines.start : Number.MAX_SAFE_INTEGER)
  for (const file of [...byFile.keys()].sort()) {
    const old = files.find((f) => f.path === file)?.oldPath ?? byFile.get(file)![0]!.oldPath
    out.push('', `## ${old ? `${file} (renomeado de ${old})` : file}`)
    for (const c of [...byFile.get(file)!].sort((a, b) => order(a) - order(b))) {
      const wide = c.scope === 'branch' && round.from ? ' (branch inteira)' : ''
      out.push('', `**${lineLabel(c.lines)}**${wide}`)
      if (c.lines && c.snippet.length) {
        const f = fence(c.snippet)
        out.push(f, ...c.snippet, f)
      }
      out.push(c.body)
    }
  }
  return `${out.join('\n')}\n`
}

/** Menu Revisões da toolbar: uma entrada por Revisão, com o estado à direita e as ações no submenu. */
export function reviewMenu(list: ReviewSummary[], current: string | undefined,
  c: { open(branch: string): void; next(branch: string): void; end(branch: string): void; back(): void }): MenuEntry[] {
  const items: MenuEntry[] = [{ label: 'Revisões', heading: true }]
  if (!list.length) items.push({ label: 'Nenhuma revisão em andamento', reason: 'Clique com o botão direito numa branch e escolha Revisar' })
  for (const r of list) {
    const moved = !r.open && (r.status.ahead > 0 || r.status.rewritten)
    const state = r.status.tip === null ? 'branch não existe mais' : r.status.merged ? 'já mergeada'
      : r.open ? `rodada ${r.round} · ${r.reviewed}/${r.files}` : moved ? 'commits novos' : `rodada ${r.round} concluída`
    items.push({ label: r.branch, shortcut: state, submenu: [
      { label: r.open ? `Continuar rodada ${r.round}` : `Ver rodada ${r.round}`, reason: r.branch === current ? 'Esta revisão já está aberta' : undefined, run: () => c.open(r.branch) },
      ...(moved ? [{ label: `Começar rodada ${r.round + 1}`, run: () => c.next(r.branch) }] : []),
      '-',
      { label: 'Encerrar revisão', danger: true, run: () => c.end(r.branch) },
    ] })
  }
  if (current) items.push('-', { label: 'Voltar ao grafo', shortcut: 'Esc', run: c.back })
  return items
}

/** Marcadores do grafo por SHA (um commit pode ter sido revisado em mais de uma branch). */
export function reviewMarks(list: ReviewSummary[]) {
  const out = new Map<string, { branch: string; rewritten: boolean; title: string }[]>()
  for (const r of list) for (const m of r.markers) {
    const notes = m.comments ? `, ${m.comments === 1 ? '1 comentário' : `${m.comments} comentários`}` : ''
    const title = m.rewritten
      ? `${r.branch}: a rodada ${m.round} revisou ${short(m.reviewed)}, antes de a branch ser reescrita`
      : `${r.branch}: revisado na rodada ${m.round} em ${date(m.concludedMs)}${notes}`
    out.set(m.sha, [...(out.get(m.sha) ?? []), { branch: r.branch, rewritten: m.rewritten, title }])
  }
  return out
}

/** Nome do arquivo ao salvar o relatório. */
export const reportName = (branch: string, round: number) => `revisao-${branch.replace(/[^\w.-]+/g, '-')}-rodada-${round}.md`
