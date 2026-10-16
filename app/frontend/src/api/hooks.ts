import {
  useMutation,
  useQuery,
  useQueryClient,
  type QueryClient,
  type QueryKey,
} from '@tanstack/react-query'
import { api } from './client'
import type { Color, Task, TaskCreate, TaskQuery, TaskUpdate } from './types'

export const keys = {
  tasks: ['tasks'] as const,
  taskList: (query: TaskQuery) => ['tasks', 'list', query] as const,
  task: (id: number) => ['tasks', 'detail', id] as const,
  projects: ['projects'] as const,
  labels: ['labels'] as const,
}

// ---------- queries ----------

export const useProjects = () => useQuery({ queryKey: keys.projects, queryFn: api.projects.list })

export const useLabels = () => useQuery({ queryKey: keys.labels, queryFn: api.labels.list })

export const useTasks = (query: TaskQuery, enabled = true) =>
  useQuery({ queryKey: keys.taskList(query), queryFn: () => api.tasks.list(query), enabled })

export const useTask = (id: number | null) =>
  useQuery({
    queryKey: keys.task(id ?? 0),
    queryFn: () => api.tasks.get(id!),
    enabled: id !== null,
  })

// ---------- cache helpers ----------

/** Tasks, projects and labels all carry counts, so any task change refreshes all three. */
function invalidateAll(qc: QueryClient) {
  return Promise.all([
    qc.invalidateQueries({ queryKey: keys.tasks }),
    qc.invalidateQueries({ queryKey: keys.projects }),
    qc.invalidateQueries({ queryKey: keys.labels }),
  ])
}

type TaskCache = Task[] | Task | undefined
type Snapshot = Array<[QueryKey, TaskCache]>

/** Apply `fn` to every cached task (lists and detail queries). Returns a snapshot for rollback. */
async function patchCachedTasks(
  qc: QueryClient,
  fn: (task: Task) => Task | null,
): Promise<Snapshot> {
  await qc.cancelQueries({ queryKey: keys.tasks })
  const snapshot = qc.getQueriesData<Task[] | Task>({ queryKey: keys.tasks })
  qc.setQueriesData<TaskCache>({ queryKey: keys.tasks }, (old) => {
    if (Array.isArray(old)) return old.map(fn).filter((t): t is Task => t !== null)
    if (old) return fn(old) ?? undefined
    return old
  })
  return snapshot
}

function restore(qc: QueryClient, snapshot: Snapshot | undefined) {
  snapshot?.forEach(([key, data]) => qc.setQueryData(key, data))
}

function optimistic(task: Task, changes: TaskUpdate): Task {
  const { label_ids: _ignored, ...fields } = changes
  const next: Task = { ...task, ...fields }
  if (changes.done !== undefined) {
    next.completed_at = changes.done ? new Date().toISOString() : null
  }
  return next
}

// ---------- task mutations ----------

export function useCreateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (data: TaskCreate) => api.tasks.create(data),
    onSettled: () => invalidateAll(qc),
  })
}

export function useUpdateTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, changes }: { id: number; changes: TaskUpdate }) =>
      api.tasks.update(id, changes),
    // Optimistic: the UI reflects the change immediately and rolls back on error.
    onMutate: async ({ id, changes }) => ({
      snapshot: await patchCachedTasks(qc, (t) => (t.id === id ? optimistic(t, changes) : t)),
    }),
    onError: (_err, _vars, context) => restore(qc, context?.snapshot),
    onSettled: () => invalidateAll(qc),
  })
}

export function useDeleteTask() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.tasks.remove(id),
    onMutate: async (id) => ({
      snapshot: await patchCachedTasks(qc, (t) => (t.id === id || t.parent_id === id ? null : t)),
    }),
    onError: (_err, _id, context) => restore(qc, context?.snapshot),
    onSettled: () => invalidateAll(qc),
  })
}

// ---------- project & label mutations ----------

export function useSaveProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, color }: { id?: number; name: string; color: Color }) =>
      id === undefined ? api.projects.create({ name, color }) : api.projects.update(id, { name, color }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.projects }),
  })
}

export function useDeleteProject() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.projects.remove(id),
    onSettled: () => invalidateAll(qc),
  })
}

export function useSaveLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, name, color }: { id?: number; name: string; color: Color }) =>
      id === undefined ? api.labels.create({ name, color }) : api.labels.update(id, { name, color }),
    onSettled: () => invalidateAll(qc),
  })
}

export function useDeleteLabel() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id: number) => api.labels.remove(id),
    onSettled: () => invalidateAll(qc),
  })
}
