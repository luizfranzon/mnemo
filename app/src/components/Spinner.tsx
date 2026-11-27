import { Icon } from './Icon'

export function Spinner({ label, size = 14 }: { label?: string; size?: number }) {
  return <><Icon name="refresh" size={size} spin />{label && <> {label}</>}</>
}
