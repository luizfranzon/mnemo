import { existsSync, readFileSync, statSync, watch, type FSWatcher } from 'node:fs'
import { isAbsolute, join, resolve } from 'node:path'

const DEBOUNCE_MS = 400
/** Arquivos que o git mexe a cada comando e não mudam o grafo. */
const NOISE = /(\.lock|^index|^FETCH_HEAD|^ORIG_HEAD|^COMMIT_EDITMSG)$/

/** `.git` pode ser pasta ou, em worktree e submódulo, um arquivo `gitdir: <caminho>`. */
function gitDirOf(workdir: string): string | null {
  const dot = join(workdir, '.git')
  if (!existsSync(dot)) return null
  if (statSync(dot).isDirectory()) return dot
  const target = /^gitdir:\s*(.+)$/m.exec(readFileSync(dot, 'utf8'))?.[1]?.trim()
  return target ? (isAbsolute(target) ? target : resolve(workdir, target)) : null
}

/** Worktree: as branches vivem no diretório comum, não no `.git/worktrees/<nome>`. */
function commonDirOf(gitDir: string): string {
  const file = join(gitDir, 'commondir')
  if (!existsSync(file)) return gitDir
  const target = readFileSync(file, 'utf8').trim()
  return isAbsolute(target) ? target : resolve(gitDir, target)
}

let watchers: FSWatcher[] = []

export function unwatchRepository() {
  for (const w of watchers) w.close()
  watchers = []
}

/**
 * Observa HEAD e refs do repositório (checkout, commit, fetch, rebase feitos por fora) e avisa uma vez por rajada.
 * Só um repositório por vez: o da aba ativa. Não olha o diretório de trabalho (o WIP já se atualiza ao focar a janela).
 * shortcut: fs.watch recursivo em `refs`, ok no Linux/Windows/macOS do Electron; se faltar numa plataforma, o foco da janela cobre.
 */
export function watchRepository(workdir: string, onChange: () => void) {
  unwatchRepository()
  const gitDir = gitDirOf(workdir)
  if (!gitDir) return
  const common = commonDirOf(gitDir)
  let timer: NodeJS.Timeout | undefined
  const bump = (_event: string, name: string | Buffer | null) => {
    if (name && NOISE.test(String(name).split(/[\\/]/).at(-1)!)) return
    clearTimeout(timer)
    timer = setTimeout(onChange, DEBOUNCE_MS)
  }
  const open = (dir: string, recursive: boolean) => {
    try {
      const w = watch(dir, { recursive }, bump)
      w.on('error', () => w.close()) // pasta apagada ou sem permissão: a janela focada ainda atualiza
      watchers.push(w)
    } catch { /* sem suporte nesta plataforma */ }
  }
  open(gitDir, false) // HEAD, MERGE_HEAD, rebase-merge…
  if (common !== gitDir) open(common, false) // packed-refs
  open(join(common, 'refs'), true)
}
