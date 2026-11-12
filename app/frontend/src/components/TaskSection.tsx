import { useId, useState, type ReactNode } from 'react'
import type { Task } from '../api/types'
import type { QuickAddDefaults } from '../layout/ui'
import { PlusIcon } from './icons'
import { QuickAdd } from './QuickAdd'
import { TaskItem } from './TaskItem'
import styles from './TaskSection.module.css'

interface TaskSectionProps {
  /** Omit for a single unnamed list (e.g. a project). */
  heading?: string
  headingAction?: ReactNode
  tasks: Task[]
  showProject?: boolean
  hideDue?: boolean
  /** When given, shows an inline "Thêm công việc" editor with these defaults. */
  addDefaults?: QuickAddDefaults
  tone?: 'default' | 'overdue'
}

export function TaskSection({
  heading,
  headingAction,
  tasks,
  showProject,
  hideDue,
  addDefaults,
  tone = 'default',
}: TaskSectionProps) {
  const headingId = useId()
  const [adding, setAdding] = useState(false)

  return (
    <section className={styles.section} aria-labelledby={heading ? headingId : undefined}>
      {heading && (
        <div className={styles.header}>
          <h2 id={headingId} className={`${styles.heading} ${tone === 'overdue' ? styles.overdue : ''}`}>
            {heading}
            <span className={styles.count}>
              {tasks.length}
              <span className="visually-hidden"> việc</span>
            </span>
          </h2>
          {headingAction}
        </div>
      )}

      {tasks.length > 0 && (
        <ul className={styles.list} aria-label={heading ? undefined : 'Danh sách công việc'}>
          {tasks.map((task) => (
            <TaskItem key={task.id} task={task} showProject={showProject} hideDue={hideDue} />
          ))}
        </ul>
      )}

      {addDefaults &&
        (adding ? (
          <div className={styles.editor}>
            <QuickAdd defaults={addDefaults} focusOnMount onClose={() => setAdding(false)} />
          </div>
        ) : (
          <button type="button" className={styles.add} onClick={() => setAdding(true)}>
            <span className={styles.addIcon}>
              <PlusIcon size={14} />
            </span>
            Thêm công việc
          </button>
        ))}
    </section>
  )
}
