import type { FileChange, HeadInfo, OperationKind, ToolbarInfo } from '../bridge/types'
import { githubBase, resetItem } from './branchMenu'
import type { MenuEntry } from './menuModel'

/** Diálogos abertos pelos menus do commit e do arquivo (o CommitDialogs os renderiza). */
export type CommitDialog =
  | { type: 'tag'; sha: string; annotated: boolean }
  | { type: 'reword'; sha: string }
  | { type: 'restoreFile'; sha: string; file: string }
  | { type: 'deleteFile'; file: string }

interface Shared {
  /** Motivo de nenhuma Operação poder rodar agora (outra em curso, merge/rebase pendente). */
  mutation?: string
  /** URL do remoto, para o link do GitHub (`null` = sem remoto). */
  remoteUrl: string | null
  dialog(d: CommitDialog): void
  copy(text: string): void
}

export interface CommitMenuContext extends Shared {
  head: HeadInfo
  toolbar: ToolbarInfo
  execute(kind: OperationKind): void
  checkout(sha: string): void
  newBranch(start: string): void
  resetHard(sha: string): void
}

export interface FileMenuContext extends Shared {
  /** Caminho absoluto do arquivo no diretório de trabalho. */
  absolute: string
  open(how: 'editor' | 'default' | 'folder'): void
}

export function commitMenu(commit: { sha: string; subject: string; head: boolean }, c: CommitMenuContext): MenuEntry[] {
  const { sha } = commit
  const short = sha.slice(0, 7)
  const mut = c.mutation
  const cur = c.head.kind === 'branch' ? c.head.name : null
  const base = githubBase(c.remoteUrl)
  return [
    { label: `${short} · ${commit.subject}`, heading: true },
    { label: 'Fazer checkout (HEAD destacado)', reason: mut ?? (commit.head ? 'Já é o HEAD' : undefined), run: () => c.checkout(sha) },
    { label: 'Nova branch aqui', shortcut: 'Ctrl+B', reason: mut, run: () => c.newBranch(sha) },
    '-',
    { label: `Cherry-pick em ${cur ?? 'HEAD'}`, reason: mut, run: () => c.execute({ type: 'cherryPick', commit: sha }) },
    { label: `Revert ${short}`, reason: mut, run: () => c.execute({ type: 'revert', commit: sha }) },
    resetItem(sha, short, cur, mut, c, 'este commit'),
    { label: 'Editar mensagem', reason: mut ?? (commit.head ? undefined : 'Só o commit HEAD pode ter a mensagem editada'),
      run: () => c.dialog({ type: 'reword', sha }) },
    '-',
    { label: 'Criar tag aqui', reason: mut, run: () => c.dialog({ type: 'tag', sha, annotated: false }) },
    { label: 'Criar tag anotada aqui', reason: mut, run: () => c.dialog({ type: 'tag', sha, annotated: true }) },
    '-',
    { label: 'Copiar SHA', shortcut: 'Ctrl+Shift+C', run: () => c.copy(sha) },
    { label: 'Copiar link no GitHub', reason: base ? undefined : 'O remoto não é do GitHub', run: () => base && c.copy(`${base}/commit/${sha}`) },
  ]
}

/** `git restore` do caminho (arquivo ou pasta) para a versão do commit; aspas só quando o caminho precisa. */
const restoreCommand = (sha: string, path: string) =>
  `git restore --source=${sha} ${/^[\w./@+-]+$/.test(path) ? path : `'${path.replaceAll("'", `'\\''`)}'`}`

export function dirMenu(sha: string, dir: string, c: Pick<Shared, 'copy'>): MenuEntry[] {
  return [
    { label: dir, heading: true },
    { label: 'Copiar comando git restore', run: () => c.copy(restoreCommand(sha, dir)) },
  ]
}

export function fileMenu(sha: string, file: FileChange, c: FileMenuContext): MenuEntry[] {
  const mut = c.mutation
  return [
    { label: file.path, heading: true },
    { label: 'Abrir no editor', run: () => c.open('editor') },
    { label: 'Abrir com programa padrão', run: () => c.open('default') },
    { label: 'Mostrar na pasta', run: () => c.open('folder') },
    '-',
    { label: 'Copiar caminho', run: () => c.copy(c.absolute) },
    { label: 'Copiar caminho relativo', run: () => c.copy(file.path) },
    '-',
    { label: 'Restaurar versão deste commit', warn: true, reason: mut ?? (file.status === 'D' ? 'O arquivo foi removido neste commit' : undefined),
      run: () => c.dialog({ type: 'restoreFile', sha, file: file.path }) },
    { label: 'Copiar comando git restore', run: () => c.copy(restoreCommand(sha, file.path)) },
    { label: 'Excluir arquivo', danger: true, reason: mut, run: () => c.dialog({ type: 'deleteFile', file: file.path }) },
  ]
}
