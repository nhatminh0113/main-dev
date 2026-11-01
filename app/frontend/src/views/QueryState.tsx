import type { ReactNode } from 'react'
import { TaskSkeleton } from '../components/Skeleton'
import styles from './views.module.css'

interface QueryStateProps {
  isPending: boolean
  error: Error | null
  onRetry: () => void
  children: ReactNode
}

/** Loading skeleton / error with retry / content. */
export function QueryState({ isPending, error, onRetry, children }: QueryStateProps) {
  if (isPending) return <TaskSkeleton />
  if (error) {
    return (
      <div role="alert" className={styles.error}>
        <span>Không tải được dữ liệu: {error.message}</span>
        <button type="button" className="btn btn-secondary" onClick={onRetry}>
          Thử lại
        </button>
      </div>
    )
  }
  return <>{children}</>
}
