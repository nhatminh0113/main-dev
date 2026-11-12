import styles from './Skeleton.module.css'

/** Placeholder rows while tasks load. */
export function TaskSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div role="status" aria-label="Đang tải" className={styles.list}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className={styles.row}>
          <span className={styles.circle} />
          <span className={styles.lines}>
            <span className={styles.line} style={{ width: `${70 - i * 12}%` }} />
            <span className={`${styles.line} ${styles.short}`} />
          </span>
        </div>
      ))}
    </div>
  )
}
