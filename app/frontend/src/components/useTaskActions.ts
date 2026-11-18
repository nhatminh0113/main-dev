import { useUpdateTask } from '../api/hooks'
import type { Task, TaskUpdate } from '../api/types'
import { useToast } from './Toast'

/** Task mutations with user feedback (toast on error, undo after completing). */
export function useTaskActions() {
  const update = useUpdateTask()
  const toast = useToast()

  const onError = (err: Error) => toast({ message: err.message, tone: 'error' })

  const change = (task: Task, changes: TaskUpdate) =>
    update.mutate({ id: task.id, changes }, { onError })

  const toggle = (task: Task) => {
    const done = !task.done
    change(task, { done })
    if (done) {
      toast({
        message: `Đã hoàn thành “${task.title}”`,
        action: { label: 'Hoàn tác', onClick: () => change(task, { done: false }) },
      })
    }
  }

  return { change, toggle }
}
