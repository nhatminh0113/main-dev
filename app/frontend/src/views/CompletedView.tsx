import { useTasks } from '../api/hooks'
import type { Task } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { TaskSection } from '../components/TaskSection'
import { dayHeading, toISODate } from '../lib/dates'
import { useToday } from '../lib/useToday'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'

const LIMIT = 100

/** Group by local completion day, newest first (the API already sorts by completed_at desc). */
function groupByDay(tasks: Task[]): Array<[string, Task[]]> {
  const groups = new Map<string, Task[]>()
  for (const task of tasks) {
    const day = toISODate(new Date(task.completed_at ?? task.updated_at))
    groups.set(day, [...(groups.get(day) ?? []), task])
  }
  return [...groups]
}

export function CompletedView() {
  const today = useToday()
  const query = useTasks({ done: true, limit: LIMIT })
  const done = (query.data ?? []).filter((t) => t.done)

  return (
    <>
      <ViewHeader
        title="Đã hoàn thành"
        subtitle={done.length >= LIMIT ? `${LIMIT} việc gần nhất` : `${done.length} việc`}
      />
      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {groupByDay(done).map(([day, tasks]) => (
          <TaskSection key={day} heading={dayHeading(day, today)} tasks={tasks} showProject />
        ))}
        {done.length === 0 && (
          <EmptyState art="calendar" title="Chưa có việc nào hoàn thành">
            Những việc bạn đánh dấu xong sẽ xuất hiện ở đây.
          </EmptyState>
        )}
      </QueryState>
    </>
  )
}
