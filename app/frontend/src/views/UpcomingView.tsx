import { useTasks } from '../api/hooks'
import { TaskSection } from '../components/TaskSection'
import { addDays, dayHeading, shortDate } from '../lib/dates'
import { useToday } from '../lib/useToday'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'

const DAYS = 7

export function UpcomingView() {
  const today = useToday()
  const last = addDays(today, DAYS - 1)
  const query = useTasks({ done: false, due_to: last })
  const open = (query.data ?? []).filter((t) => !t.done)
  const overdue = open.filter((t) => t.due_date! < today)
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i))

  return (
    <>
      <ViewHeader
        title="Sắp tới"
        subtitle={`${shortDate(today, today)} – ${shortDate(last, today)} · ${open.length} việc`}
      />
      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {overdue.length > 0 && (
          <TaskSection heading="Quá hạn" tone="overdue" tasks={overdue} showProject />
        )}
        {days.map((day) => (
          <TaskSection
            key={day}
            heading={dayHeading(day, today)}
            tasks={open.filter((t) => t.due_date === day)}
            showProject
            hideDue
            addDefaults={{ dueDate: day }}
          />
        ))}
      </QueryState>
    </>
  )
}
