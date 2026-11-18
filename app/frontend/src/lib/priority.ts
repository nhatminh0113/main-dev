import type { Priority } from '../api/types'

export const PRIORITY_LABEL: Record<Priority, string> = {
  1: 'Ưu tiên 1',
  2: 'Ưu tiên 2',
  3: 'Ưu tiên 3',
  4: 'Ưu tiên 4',
}

export const priorityColor = (p: Priority) => `var(--color-p${p})`
