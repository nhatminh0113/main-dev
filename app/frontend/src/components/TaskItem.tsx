import { useProjects } from '../api/hooks'
import type { Task } from '../api/types'
import { useUI } from '../layout/ui'
import { COLOR_HEX } from '../lib/colors'
import { describeDue } from '../lib/dates'
import { PRIORITY_LABEL } from '../lib/priority'
import { hhmm } from '../lib/time'
import { useToday } from '../lib/useToday'
import { CalendarIcon, CheckIcon, ColorDot, PencilIcon, SubtaskIcon } from './icons'
import { DuePicker } from './pickers'
import styles from './TaskItem.module.css'
import { useTaskActions } from './useTaskActions'

interface TaskItemProps {
  task: Task
  /** Show the project name on the right (Today, Upcoming, labels, search). */
  showProject?: boolean
  /** Hide the due date (e.g. inside a day section of Upcoming). */
  hideDue?: boolean
}

export function TaskItem({ task, showProject = false, hideDue = false }: TaskItemProps) {
  const today = useToday()
  const { openTask } = useUI()
  const { toggle, change } = useTaskActions()
  const { data: projects = [] } = useProjects()
  const project = showProject ? projects.find((p) => p.id === task.project_id) : undefined
  const due = task.due_date && !hideDue ? describeDue(task.due_date, today) : null
  const description = task.description.split('\n')[0]

  return (
    <li className={`${styles.item} ${task.done ? styles.done : ''}`} data-priority={task.priority}>
      <button
        type="button"
        role="checkbox"
        aria-checked={task.done}
        aria-label={`${task.done ? 'Bỏ hoàn thành' : 'Hoàn thành'} “${task.title}”`}
        className={styles.check}
        title={PRIORITY_LABEL[task.priority]}
        onClick={() => toggle(task)}
      >
        <CheckIcon size={12} className={styles.checkMark} />
      </button>

      <div className={styles.body}>
        <button type="button" className={styles.title} onClick={() => openTask(task.id)}>
          {task.title}
        </button>
        {description && <p className={styles.description}>{description}</p>}

        {(due || task.subtask_count > 0 || task.labels.length > 0 || project) && (
          <div className={styles.meta}>
            {due && (
              <span className={`${styles.due} ${styles[due.tone]}`}>
                <CalendarIcon size={14} />
                <span>
                  <span className="visually-hidden">Hạn: </span>
                  {due.label}
                  {task.due_time && ` ${hhmm(task.due_time)}`}
                </span>
              </span>
            )}
            {task.subtask_count > 0 && (
              <span className={styles.subtasks}>
                <SubtaskIcon size={14} />
                <span>
                  <span className="visually-hidden">Công việc con: </span>
                  {task.subtask_done_count}/{task.subtask_count}
                </span>
              </span>
            )}
            {task.labels.map((label) => (
              <span key={label.id} className={styles.label} style={{ color: COLOR_HEX[label.color] }}>
                <span className={styles.labelText}>@{label.name}</span>
              </span>
            ))}
            {project && (
              <span className={styles.project}>
                <span>{project.name}</span>
                <ColorDot color={COLOR_HEX[project.color]} size={8} />
              </span>
            )}
          </div>
        )}
      </div>

      {!task.done && (
        <div className={styles.actions}>
          <button
            type="button"
            className="icon-btn"
            aria-label={`Sửa “${task.title}”`}
            title="Sửa"
            onClick={() => openTask(task.id)}
          >
            <PencilIcon size={16} />
          </button>
          <DuePicker iconOnly value={task.due_date} onChange={(d) => change(task, { due_date: d })} />
        </div>
      )}
    </li>
  )
}
