import { useEffect, type ReactNode } from 'react'
import styles from './views.module.css'

interface ViewHeaderProps {
  title: string
  subtitle?: ReactNode
  actions?: ReactNode
  icon?: ReactNode
}

export function ViewHeader({ title, subtitle, actions, icon }: ViewHeaderProps) {
  useEffect(() => {
    document.title = `${title} · Taskapp`
  }, [title])

  return (
    <header className={styles.header}>
      <div className={styles.headingBlock}>
        <h1 className={styles.title}>
          {icon}
          {title}
        </h1>
        {subtitle && <p className={styles.subtitle}>{subtitle}</p>}
      </div>
      {actions && <div className={styles.actions}>{actions}</div>}
    </header>
  )
}
