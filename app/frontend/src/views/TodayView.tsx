import { useTasks, useUpdateTask } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { TaskSection } from '../components/TaskSection'
import { useToast } from '../components/Toast'
import { dayHeading, longDate } from '../lib/dates'
import { useToday } from '../lib/useToday'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'
import styles from './views.module.css'

export function TodayView() {
  const today = useToday()
  const query = useTasks({ done: false, due_to: today })
  const update = useUpdateTask()
  const toast = useToast()
  const open = (query.data ?? []).filter((t) => !t.done)
  const overdue = open.filter((t) => t.due_date! < today)
  const dueToday = open.filter((t) => t.due_date === today)

  const rescheduleOverdue = async () => {
    const results = await Promise.allSettled(
      overdue.map((t) => update.mutateAsync({ id: t.id, changes: { due_date: today } })),
    )
    const failed = results.filter((r) => r.status === 'rejected').length
    toast(
      failed
        ? { message: `Không dời được ${failed} việc`, tone: 'error' }
        : { message: `Đã dời ${overdue.length} việc sang hôm nay` },
    )
  }

  return (
    <>
      <ViewHeader
        title="Hôm nay"
        subtitle={`${longDate(today)} · ${open.length} việc`}
      />
      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        {overdue.length > 0 && (
          <TaskSection
            heading="Quá hạn"
            tone="overdue"
            tasks={overdue}
            showProject
            headingAction={
              <button type="button" className={styles.linkButton} onClick={rescheduleOverdue}>
                Lên lịch lại
              </button>
            }
          />
        )}
        <TaskSection
          heading={dayHeading(today, today)}
          tasks={dueToday}
          showProject
          hideDue
          addDefaults={{ dueDate: today }}
        />
        {open.length === 0 && (
          <EmptyState art="done" title="Bạn đã xong mọi việc hôm nay">
            Tận hưởng thời gian còn lại, hoặc thêm việc cho ngày mai.
          </EmptyState>
        )}
      </QueryState>
    </>
  )
}
