import { useCallback, useEffect, useState } from 'react'
import { api } from './api'
import { TaskForm } from './components/TaskForm'
import { TaskList } from './components/TaskList'
import type { Task } from './types'

type LoadState = 'loading' | 'error' | 'ready'

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback
}

export default function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [loadState, setLoadState] = useState<LoadState>('loading')
  const [actionError, setActionError] = useState<string | null>(null)
  const [busyIds, setBusyIds] = useState<ReadonlySet<number>>(new Set())

  const loadTasks = useCallback(async () => {
    setLoadState('loading')
    try {
      setTasks(await api.listTasks())
      setLoadState('ready')
    } catch {
      setLoadState('error')
    }
  }, [])

  useEffect(() => {
    // Fetching on mount is the intended side effect here.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTasks()
  }, [loadTasks])

  function setBusy(id: number, busy: boolean) {
    setBusyIds((prev) => {
      const next = new Set(prev)
      if (busy) next.add(id)
      else next.delete(id)
      return next
    })
  }

  async function handleCreate(title: string) {
    const created = await api.createTask(title) // errors are shown by TaskForm
    setActionError(null)
    setTasks((prev) => [...prev, created])
  }

  async function handleToggle(task: Task) {
    setBusy(task.id, true)
    setActionError(null)
    try {
      const updated = await api.updateTask(task.id, { done: !task.done })
      setTasks((prev) => prev.map((t) => (t.id === updated.id ? updated : t)))
    } catch (err) {
      setActionError(errorMessage(err, 'Không cập nhật được công việc.'))
    } finally {
      setBusy(task.id, false)
    }
  }

  async function handleDelete(task: Task) {
    setBusy(task.id, true)
    setActionError(null)
    try {
      await api.deleteTask(task.id)
      setTasks((prev) => prev.filter((t) => t.id !== task.id))
    } catch (err) {
      setActionError(errorMessage(err, 'Không xóa được công việc.'))
    } finally {
      setBusy(task.id, false)
    }
  }

  return (
    <main className="app">
      <header className="app__header">
        <h1>Task Manager</h1>
        <p className="app__subtitle">Quản lý công việc hằng ngày</p>
      </header>

      <section className="card" aria-labelledby="tasks-heading">
        <h2 id="tasks-heading" className="visually-hidden">
          Công việc
        </h2>

        <TaskForm onCreate={handleCreate} />

        {actionError && (
          <p role="alert" className="banner banner--error">
            {actionError}
          </p>
        )}

        {loadState === 'loading' && (
          <p role="status" className="status">
            Đang tải danh sách…
          </p>
        )}

        {loadState === 'error' && (
          <div role="alert" className="banner banner--error">
            <span>Không tải được danh sách công việc.</span>
            <button type="button" className="button" onClick={() => void loadTasks()}>
              Thử lại
            </button>
          </div>
        )}

        {loadState === 'ready' && (
          <TaskList
            tasks={tasks}
            busyIds={busyIds}
            onToggle={(task) => void handleToggle(task)}
            onDelete={(task) => void handleDelete(task)}
          />
        )}
      </section>
    </main>
  )
}
