/**
 * In-memory stand-in for the FastAPI backend, installed as `fetch`.
 * Implements just enough of the real semantics (filters, smart sort, counts)
 * for integration tests of views and dialogs.
 */
import { vi } from 'vitest'
import type { Color, Label, Priority, Project, Task } from '../api/types'

interface State {
  projects: Project[]
  labels: Label[]
  tasks: Task[]
  nextId: number
}

export interface FakeApi {
  state: State
  fetch: ReturnType<typeof vi.fn<typeof fetch>>
  /** Make the next request matching method + path fail with this status/detail. */
  failNext: (method: string, pathPrefix: string, status: number, detail: string) => void
  addProject: (name: string, color?: Color) => Project
  addLabel: (name: string, color?: Color) => Label
  addTask: (title: string, fields?: Partial<Task>) => Task
}

const NOW = '2026-10-16T09:00:00Z'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } })

export function createFakeApi(): FakeApi {
  const state: State = {
    projects: [
      {
        id: 1,
        name: 'Ghi nhanh',
        color: 'grey',
        is_inbox: true,
        position: 0,
        created_at: NOW,
        open_count: 0,
      },
    ],
    labels: [],
    tasks: [],
    nextId: 100,
  }
  let failure: { method: string; path: string; status: number; detail: string } | null = null

  const withCounts = () => {
    for (const p of state.projects) {
      p.open_count = state.tasks.filter((t) => t.project_id === p.id && !t.done).length
    }
    for (const l of state.labels) {
      l.open_count = state.tasks.filter((t) => !t.done && t.labels.some((x) => x.id === l.id)).length
    }
  }

  const withSubtaskCounts = (task: Task): Task => {
    const children = state.tasks.filter((t) => t.parent_id === task.id)
    return {
      ...task,
      subtask_count: children.length,
      subtask_done_count: children.filter((c) => c.done).length,
    }
  }

  const labelBriefs = (ids: number[]) =>
    state.labels
      .filter((l) => ids.includes(l.id))
      .map(({ id, name, color }) => ({ id, name, color }))

  const addProject = (name: string, color: Color = 'indigo'): Project => {
    const project: Project = {
      id: state.nextId++,
      name,
      color,
      is_inbox: false,
      position: state.projects.length,
      created_at: NOW,
      open_count: 0,
    }
    state.projects.push(project)
    return project
  }

  const addLabel = (name: string, color: Color = 'grey'): Label => {
    const label: Label = { id: state.nextId++, name, color, created_at: NOW, open_count: 0 }
    state.labels.push(label)
    return label
  }

  const addTask = (title: string, fields: Partial<Task> = {}): Task => {
    const task: Task = {
      id: state.nextId++,
      project_id: 1,
      parent_id: null,
      title,
      description: '',
      priority: 4,
      due_date: null,
      due_time: null,
      duration_minutes: null,
      done: false,
      completed_at: null,
      position: state.tasks.length + 1,
      created_at: NOW,
      updated_at: NOW,
      labels: [],
      subtask_count: 0,
      subtask_done_count: 0,
      ...fields,
    }
    state.tasks.push(task)
    return task
  }

  const listTasks = (params: URLSearchParams): Task[] => {
    let tasks = [...state.tasks]
    const num = (k: string) => (params.has(k) ? Number(params.get(k)) : undefined)
    const projectId = num('project_id')
    const labelId = num('label_id')
    const parentId = num('parent_id')
    if (projectId !== undefined) tasks = tasks.filter((t) => t.project_id === projectId)
    if (labelId !== undefined) tasks = tasks.filter((t) => t.labels.some((l) => l.id === labelId))
    if (parentId !== undefined) tasks = tasks.filter((t) => t.parent_id === parentId)
    if (params.get('top_level') === 'true') tasks = tasks.filter((t) => t.parent_id === null)
    if (params.has('done')) tasks = tasks.filter((t) => t.done === (params.get('done') === 'true'))
    const from = params.get('due_from')
    const to = params.get('due_to')
    if (from) tasks = tasks.filter((t) => t.due_date !== null && t.due_date >= from)
    if (to) tasks = tasks.filter((t) => t.due_date !== null && t.due_date <= to)
    const q = params.get('q')?.toLowerCase()
    if (q) tasks = tasks.filter((t) => `${t.title} ${t.description}`.toLowerCase().includes(q))

    tasks.sort((a, b) =>
      params.get('done') === 'true'
        ? (b.completed_at ?? '').localeCompare(a.completed_at ?? '')
        : (a.due_date ?? '9999').localeCompare(b.due_date ?? '9999') ||
          (a.due_time ?? '99').localeCompare(b.due_time ?? '99') ||
          a.priority - b.priority ||
          a.position - b.position,
    )
    return tasks.slice(0, num('limit') ?? 200).map(withSubtaskCounts)
  }

  const handle = async (method: string, path: string, params: URLSearchParams, body: any) => {
    // ---- projects
    if (path === '/api/projects' && method === 'GET') {
      withCounts()
      return json(state.projects)
    }
    if (path === '/api/projects' && method === 'POST') return json(addProject(body.name, body.color), 201)
    let m = /^\/api\/projects\/(\d+)$/.exec(path)
    if (m) {
      const project = state.projects.find((p) => p.id === Number(m![1]))
      if (!project) return json({ detail: 'Project not found' }, 404)
      if (method === 'PATCH') return json(Object.assign(project, body))
      state.projects = state.projects.filter((p) => p !== project)
      state.tasks = state.tasks.filter((t) => t.project_id !== project.id)
      return new Response(null, { status: 204 })
    }

    // ---- labels
    if (path === '/api/labels' && method === 'GET') {
      withCounts()
      return json(state.labels)
    }
    if (path === '/api/labels' && method === 'POST') {
      if (state.labels.some((l) => l.name.toLowerCase() === body.name.toLowerCase())) {
        return json({ detail: 'A label with this name already exists' }, 409)
      }
      return json(addLabel(body.name, body.color), 201)
    }
    m = /^\/api\/labels\/(\d+)$/.exec(path)
    if (m) {
      const label = state.labels.find((l) => l.id === Number(m![1]))
      if (!label) return json({ detail: 'Label not found' }, 404)
      if (method === 'PATCH') return json(Object.assign(label, body))
      state.labels = state.labels.filter((l) => l !== label)
      return new Response(null, { status: 204 })
    }

    // ---- tasks
    if (path === '/api/tasks' && method === 'GET') return json(listTasks(params))
    if (path === '/api/tasks' && method === 'POST') {
      const parent = body.parent_id ? state.tasks.find((t) => t.id === body.parent_id) : undefined
      const task = addTask(body.title, {
        description: body.description ?? '',
        priority: (body.priority ?? 4) as Priority,
        due_date: body.due_date ?? null,
        due_time: body.due_time ? `${body.due_time}:00`.slice(0, 8) : null,
        duration_minutes: body.duration_minutes ?? null,
        project_id: parent?.project_id ?? body.project_id ?? 1,
        parent_id: body.parent_id ?? null,
        labels: labelBriefs(body.label_ids ?? []),
      })
      return json(withSubtaskCounts(task), 201)
    }
    m = /^\/api\/tasks\/(\d+)$/.exec(path)
    if (m) {
      const task = state.tasks.find((t) => t.id === Number(m![1]))
      if (!task) return json({ detail: 'Task not found' }, 404)
      if (method === 'GET') return json(withSubtaskCounts(task))
      if (method === 'PATCH') {
        const { label_ids, ...fields } = body
        if (typeof fields.due_time === 'string') fields.due_time = `${fields.due_time}:00`.slice(0, 8)
        Object.assign(task, fields)
        // Same consistency rules as the real API
        if (task.due_date === null) task.due_time = null
        if (task.due_time === null) task.duration_minutes = null
        if (label_ids) task.labels = labelBriefs(label_ids)
        if ('done' in fields) task.completed_at = fields.done ? '2026-10-16T10:00:00Z' : null
        return json(withSubtaskCounts(task))
      }
      state.tasks = state.tasks.filter((t) => t.id !== task.id && t.parent_id !== task.id)
      return new Response(null, { status: 204 })
    }
    return json({ detail: `No fake route for ${method} ${path}` }, 404)
  }

  const fetchMock = vi.fn<typeof fetch>(async (input, init) => {
    const url = new URL(String(input), 'http://localhost')
    const method = init?.method ?? 'GET'
    if (failure && failure.method === method && url.pathname.startsWith(failure.path)) {
      const { status, detail } = failure
      failure = null
      return json({ detail }, status)
    }
    const body = init?.body ? JSON.parse(String(init.body)) : undefined
    return handle(method, url.pathname, url.searchParams, body)
  })

  return {
    state,
    fetch: fetchMock,
    failNext: (method, path, status, detail) => {
      failure = { method, path, status, detail }
    },
    addProject,
    addLabel,
    addTask,
  }
}
