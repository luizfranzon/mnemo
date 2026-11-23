import type { ReactNode } from 'react'

export function EmptyState({ className, loading, children }: { className: string; loading?: boolean; children: ReactNode }) {
  return <div className={className} role={loading ? 'status' : undefined}>{children}</div>
}
