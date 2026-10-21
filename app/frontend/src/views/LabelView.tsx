import { useParams } from 'react-router'
import { useLabels, useTasks } from '../api/hooks'
import type { Label } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { PencilIcon, TagIcon } from '../components/icons'
import { TaskSection } from '../components/TaskSection'
import { useUI } from '../layout/ui'
import { COLOR_HEX } from '../lib/colors'
import { NotFoundView } from './NotFoundView'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'

export function LabelRoute() {
  const { id } = useParams()
  const { data: labels, isPending, error, refetch } = useLabels()
  const label = labels?.find((l) => l.id === Number(id))
  if (!isPending && !error && !label) return <NotFoundView />
  return (
    <QueryState isPending={isPending} error={error} onRetry={() => refetch()}>
      {label && <LabelView label={label} />}
    </QueryState>
  )
}

function LabelView({ label }: { label: Label }) {
  const { editLabel } = useUI()
  const query = useTasks({ label_id: label.id, done: false })
  const open = (query.data ?? []).filter((t) => !t.done)

  return (
    <>
      <ViewHeader
        title={label.name}
        icon={<TagIcon size={22} style={{ color: COLOR_HEX[label.color] }} />}
        subtitle={`${open.length} việc`}
        actions={
          <button type="button" className="btn btn-ghost" onClick={() => editLabel(label)}>
            <PencilIcon size={16} /> Sửa nhãn
          </button>
        }
      />
      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        <TaskSection tasks={open} showProject addDefaults={{ labelIds: [label.id] }} />
        {open.length === 0 && (
          <EmptyState art="project" title={`Chưa có việc nào gắn nhãn “${label.name}”`}>
            Gõ <kbd>@{label.name}</kbd> khi thêm nhanh để gắn nhãn này.
          </EmptyState>
        )}
      </QueryState>
    </>
  )
}
