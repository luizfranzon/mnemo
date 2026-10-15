import {
  Archive, ArrowDown, ArrowDownToLine, ArrowDownWideNarrow, ArrowLeft, ArrowRight, ArrowUp, ArrowUpDown, ArrowUpFromLine, Ban, Check,
  ChevronDown, ChevronRight, ChevronUp, Circle, CircleDot, Cloud, Copy, Dot, EllipsisVertical, Eye, EyeOff, Flag, Folder, FolderGit2, Funnel,
  GitBranch, GitCommitHorizontal, Inbox, Laptop, LayoutGrid, Minus, Package, PanelLeftClose, PenLine, Pencil, Plus, Redo2, RefreshCw, Search,
  SlidersVertical, Square, Tag, Trash2, TriangleAlert, Undo2, X, type LucideIcon,
} from 'lucide-react'

const ICONS = {
  branch: GitBranch, check: Check, laptop: Laptop, cloud: Cloud, folder: Folder, repo: FolderGit2, search: Search, collapse: PanelLeftClose,
  pin: Flag, worktrees: LayoutGrid, stashes: Archive, tags: Tag, submodules: Package, edit: PenLine, filter: Funnel, sliders: SlidersVertical,
  undo: Undo2, redo: Redo2, pull: ArrowDownToLine, push: ArrowUpFromLine, stash: Inbox, warning: TriangleAlert, chevron: ChevronRight,
  chevronDown: ChevronDown, chevronUp: ChevronUp, close: X, plus: Plus, minus: Minus, square: Square, more: EllipsisVertical, copy: Copy,
  sort: ArrowUpDown, sortDown: ArrowDownWideNarrow, refresh: RefreshCw, shown: Eye, hidden: EyeOff, radioOn: CircleDot, radioOff: Circle,
  back: ArrowLeft, arrowUp: ArrowUp, arrowDown: ArrowDown, modified: Pencil, renamed: ArrowRight, unchanged: Dot, trash: Trash2,
  commit: GitCommitHorizontal, noEol: Ban,
} satisfies Record<string, LucideIcon>

export type IconName = keyof typeof ICONS

/** Ícone do app (Lucide). Herda a cor do texto; `spin` gira (operação em andamento). */
export function Icon({ name, size = 15, strokeWidth = 1.8, spin = false }: { name: IconName; size?: number; strokeWidth?: number; spin?: boolean }) {
  const Svg = ICONS[name]
  return <Svg className={spin ? 'icon spin' : 'icon'} size={size} strokeWidth={strokeWidth} aria-hidden="true" />
}
