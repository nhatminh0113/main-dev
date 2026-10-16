import type { Task } from '../types'

interface TaskListProps {
  tasks: Task[]
  onToggle: (task: Task) => void
  onDelete: (task: Task) => void
  /** Tasks with a request in flight: their controls are disabled. */
  busyIds?: ReadonlySet<number>
}

export function TaskList({ tasks, onToggle, onDelete, busyIds = new Set() }: TaskListProps) {
  if (tasks.length === 0) {
    return <p className="empty">Chưa có công việc nào. Hãy thêm việc đầu tiên.</p>
  }

  const doneCount = tasks.filter((t) => t.done).length

  return (
    <>
      <p className="summary">
        {doneCount}/{tasks.length} việc đã xong
      </p>
      <ul className="task-list" aria-label="Danh sách công việc">
        {tasks.map((task) => {
          const checkboxId = `task-${task.id}`
          const busy = busyIds.has(task.id)
          return (
            <li key={task.id} className={`task${task.done ? ' task--done' : ''}`}>
              <input
                id={checkboxId}
                type="checkbox"
                className="task__checkbox"
                checked={task.done}
                disabled={busy}
                onChange={() => onToggle(task)}
              />
              <label htmlFor={checkboxId} className="task__title">
                {task.title}
              </label>
              <button
                type="button"
                className="button button--danger"
                aria-label={`Xóa công việc "${task.title}"`}
                disabled={busy}
                onClick={() => onDelete(task)}
              >
                Xóa
              </button>
            </li>
          )
        })}
      </ul>
    </>
  )
}
