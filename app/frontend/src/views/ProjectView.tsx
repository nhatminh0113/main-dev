import { useParams } from 'react-router'
import { useProjects, useTasks } from '../api/hooks'
import type { Project } from '../api/types'
import { EmptyState } from '../components/EmptyState'
import { ColorDot, PencilIcon } from '../components/icons'
import { TaskSection } from '../components/TaskSection'
import { useUI } from '../layout/ui'
import { COLOR_HEX } from '../lib/colors'
import { NotFoundView } from './NotFoundView'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'

/** /project/:id */
export function ProjectRoute() {
  const { id } = useParams()
  const { data: projects, isPending, error, refetch } = useProjects()
  const project = projects?.find((p) => p.id === Number(id))
  if (!isPending && !error && !project) return <NotFoundView />
  return (
    <QueryState isPending={isPending} error={error} onRetry={() => refetch()}>
      {project && <ProjectView project={project} />}
    </QueryState>
  )
}

/** /inbox */
export function InboxRoute() {
  const { data: projects, isPending, error, refetch } = useProjects()
  const inbox = projects?.find((p) => p.is_inbox)
  return (
    <QueryState isPending={isPending} error={error} onRetry={() => refetch()}>
      {inbox && <ProjectView project={inbox} />}
    </QueryState>
  )
}

function ProjectView({ project }: { project: Project }) {
  const { editProject } = useUI()
  const query = useTasks({ project_id: project.id, done: false, top_level: true })
  const open = (query.data ?? []).filter((t) => !t.done)

  return (
    <>
      <ViewHeader
        title={project.name}
        icon={project.is_inbox ? undefined : <ColorDot color={COLOR_HEX[project.color]} size={12} />}
        subtitle={`${open.length} việc`}
        actions={
          !project.is_inbox && (
            <button type="button" className="btn btn-ghost" onClick={() => editProject(project)}>
              <PencilIcon size={16} /> Sửa dự án
            </button>
          )
        }
      />
      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        <TaskSection tasks={open} addDefaults={{ projectId: project.id }} />
        {open.length === 0 &&
          (project.is_inbox ? (
            <EmptyState art="inbox" title="Chưa có ghi chú nào">
              Ghi nhanh mọi việc vào đây, sắp xếp sau. Nhấn <kbd>q</kbd> ở bất kỳ đâu để thêm.
            </EmptyState>
          ) : (
            <EmptyState art="project" title="Dự án chưa có việc nào">
              Chia mục tiêu lớn thành các việc nhỏ để bắt đầu.
            </EmptyState>
          ))}
      </QueryState>
    </>
  )
}
