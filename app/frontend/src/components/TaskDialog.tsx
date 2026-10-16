import { useId, useState } from 'react'
import { useDeleteTask, useProjects, useTask, useTasks } from '../api/hooks'
import { ApiError } from '../api/client'
import { DESCRIPTION_MAX_LENGTH, TITLE_MAX_LENGTH, type Task } from '../api/types'
import { useUI } from '../layout/ui'
import { COLOR_HEX } from '../lib/colors'
import { Dialog } from './Dialog'
import { CheckIcon, ColorDot, PlusIcon, TrashIcon } from './icons'
import { DuePicker, LabelPicker, PriorityPicker, ProjectSelect } from './pickers'
import { QuickAdd } from './QuickAdd'
import { TaskSkeleton } from './Skeleton'
import styles from './TaskDialog.module.css'
import { TaskItem } from './TaskItem'
import { useToast } from './Toast'
import { useTaskActions } from './useTaskActions'

export function TaskDialog({ taskId, onClose }: { taskId: number | null; onClose: () => void }) {
  const { data: task, isPending, error } = useTask(taskId)

  return (
    <Dialog open={taskId !== null} onClose={onClose} title={task?.title ?? 'Chi tiết công việc'} hideTitle size="lg">
      {isPending && <TaskSkeleton rows={2} />}
      {error && (
        <p role="alert" className={styles.error}>
          {error instanceof ApiError && error.status === 404
            ? 'Công việc này không còn tồn tại.'
            : error.message}
        </p>
      )}
      {/* Re-mount per task so local edit state starts fresh. */}
      {task && <TaskDetail key={task.id} task={task} onClose={onClose} />}
    </Dialog>
  )
}

function TaskDetail({ task, onClose }: { task: Task; onClose: () => void }) {
  const { change, toggle } = useTaskActions()
  const { openTask } = useUI()
  const toast = useToast()
  const deleteTask = useDeleteTask()
  const { data: projects = [] } = useProjects()
  const { data: parent } = useTask(task.parent_id)
  const { data: subtasks = [] } = useTasks({ parent_id: task.id })
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [addingSubtask, setAddingSubtask] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const titleId = useId()
  const descriptionId = useId()
  const projectId = useId()

  const project = projects.find((p) => p.id === task.project_id)
  const dirty = title.trim() !== task.title || description !== task.description
  const canSave = dirty && title.trim().length > 0

  const save = () => {
    if (!canSave) return
    change(task, { title: title.trim(), description })
  }

  const cancel = () => {
    setTitle(task.title)
    setDescription(task.description)
  }

  return (
    <div className={styles.layout}>
      <div className={styles.main}>
        {parent && (
          <button type="button" className={styles.parent} onClick={() => openTask(parent.id)}>
            ↰ Thuộc: {parent.title}
          </button>
        )}

        <div className={styles.titleRow}>
          <button
            type="button"
            role="checkbox"
            aria-checked={task.done}
            aria-label={task.done ? 'Bỏ hoàn thành' : 'Hoàn thành'}
            className={styles.check}
            data-priority={task.priority}
            onClick={() => toggle(task)}
          >
            <CheckIcon size={12} />
          </button>
          <div className={styles.titleFields}>
            <label htmlFor={titleId} className="visually-hidden">
              Tên công việc
            </label>
            <input
              id={titleId}
              className={`${styles.title} ${task.done ? styles.titleDone : ''}`}
              value={title}
              maxLength={TITLE_MAX_LENGTH}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault()
                  save()
                }
              }}
            />
            <label htmlFor={descriptionId} className="visually-hidden">
              Mô tả
            </label>
            <textarea
              id={descriptionId}
              className={styles.description}
              placeholder="Thêm mô tả…"
              value={description}
              maxLength={DESCRIPTION_MAX_LENGTH}
              rows={3}
              onChange={(e) => setDescription(e.target.value)}
            />
            {dirty && (
              <div className={styles.saveRow}>
                <button type="button" className="btn btn-secondary" onClick={cancel}>
                  Hủy
                </button>
                <button type="button" className="btn btn-primary" disabled={!canSave} onClick={save}>
                  Lưu
                </button>
              </div>
            )}
          </div>
        </div>

        {task.parent_id === null && (
          <section className={styles.subtasks} aria-labelledby={`${titleId}-sub`}>
            <h3 id={`${titleId}-sub`} className={styles.sectionTitle}>
              Công việc con
              {subtasks.length > 0 && (
                <span className={styles.count}>
                  {subtasks.filter((s) => s.done).length}/{subtasks.length}
                </span>
              )}
            </h3>
            {subtasks.length > 0 && (
              <ul aria-label="Công việc con">
                {subtasks.map((s) => (
                  <TaskItem key={s.id} task={s} />
                ))}
              </ul>
            )}
            {addingSubtask ? (
              <QuickAdd
                focusOnMount
                defaults={{ parentId: task.id }}
                onClose={() => setAddingSubtask(false)}
              />
            ) : (
              <button type="button" className={styles.addSub} onClick={() => setAddingSubtask(true)}>
                <PlusIcon size={14} /> Thêm công việc con
              </button>
            )}
          </section>
        )}
      </div>

      <aside className={styles.side} aria-label="Thuộc tính">
        <div className={styles.field}>
          <label htmlFor={projectId} className={styles.fieldLabel}>
            Dự án
          </label>
          {task.parent_id === null ? (
            <ProjectSelect
              id={projectId}
              value={task.project_id}
              onChange={(id) => change(task, { project_id: id })}
            />
          ) : (
            <span id={projectId} className={styles.static}>
              {project && <ColorDot color={COLOR_HEX[project.color]} />} {project?.name}
            </span>
          )}
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Ngày hết hạn</span>
          <DuePicker value={task.due_date} onChange={(d) => change(task, { due_date: d })} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Mức ưu tiên</span>
          <PriorityPicker value={task.priority} onChange={(p) => change(task, { priority: p })} />
        </div>
        <div className={styles.field}>
          <span className={styles.fieldLabel}>Nhãn</span>
          <LabelPicker
            value={task.labels.map((l) => l.id)}
            onChange={(ids) => change(task, { label_ids: ids })}
          />
        </div>

        <div className={styles.danger}>
          {confirmDelete ? (
            <>
              <p className={styles.confirmText}>
                Xóa công việc này{task.subtask_count ? ` và ${task.subtask_count} việc con` : ''}?
              </p>
              <div className={styles.saveRow}>
                <button type="button" className="btn btn-secondary" onClick={() => setConfirmDelete(false)}>
                  Không
                </button>
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => {
                    deleteTask.mutate(task.id, {
                      onError: (err) => toast({ message: err.message, tone: 'error' }),
                    })
                    toast({ message: `Đã xóa “${task.title}”` })
                    onClose()
                  }}
                >
                  Xóa
                </button>
              </div>
            </>
          ) : (
            <button type="button" className={`btn btn-ghost ${styles.deleteBtn}`} onClick={() => setConfirmDelete(true)}>
              <TrashIcon size={16} /> Xóa công việc
            </button>
          )}
        </div>
      </aside>
    </div>
  )
}
