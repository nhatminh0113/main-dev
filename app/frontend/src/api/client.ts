import type { Label, Project, Task, TaskCreate, TaskQuery, TaskUpdate, Color } from './types'

/** Error returned by the API (non-2xx) or raised when the server is unreachable (status 0). */
export class ApiError extends Error {
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.name = 'ApiError'
    this.status = status
  }
}

// Always relative: Vite proxy (dev), nginx (Docker Compose) or the Ingress (k8s) routes /api.
const BASE = '/api'

/** FastAPI returns `detail` as a string (404/409/422) or a list of validation errors (422). */
function messageFrom(body: unknown, status: number): string {
  const detail = (body as { detail?: unknown } | null)?.detail
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail) && typeof detail[0]?.msg === 'string') return detail[0].msg
  return `Máy chủ trả về lỗi ${status}`
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  let response: Response
  try {
    response = await fetch(`${BASE}${path}`, {
      ...init,
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
    })
  } catch {
    throw new ApiError(0, 'Không kết nối được tới máy chủ')
  }

  if (response.status === 204) return undefined as T

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new ApiError(response.status, messageFrom(body, response.status))
  return body as T
}

function toSearchParams(query: TaskQuery): string {
  const params = new URLSearchParams()
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== null && value !== '') params.set(key, String(value))
  }
  const s = params.toString()
  return s ? `?${s}` : ''
}

const json = (method: string, body?: unknown): RequestInit => ({
  method,
  body: body === undefined ? undefined : JSON.stringify(body),
})

export const api = {
  tasks: {
    list: (query: TaskQuery = {}) => request<Task[]>(`/tasks${toSearchParams(query)}`),
    get: (id: number) => request<Task>(`/tasks/${id}`),
    create: (data: TaskCreate) => request<Task>('/tasks', json('POST', data)),
    update: (id: number, changes: TaskUpdate) =>
      request<Task>(`/tasks/${id}`, json('PATCH', changes)),
    remove: (id: number) => request<void>(`/tasks/${id}`, json('DELETE')),
  },
  projects: {
    list: () => request<Project[]>('/projects'),
    create: (data: { name: string; color?: Color }) =>
      request<Project>('/projects', json('POST', data)),
    update: (id: number, changes: { name?: string; color?: Color; position?: number }) =>
      request<Project>(`/projects/${id}`, json('PATCH', changes)),
    remove: (id: number) => request<void>(`/projects/${id}`, json('DELETE')),
  },
  labels: {
    list: () => request<Label[]>('/labels'),
    create: (data: { name: string; color?: Color }) => request<Label>('/labels', json('POST', data)),
    update: (id: number, changes: { name?: string; color?: Color }) =>
      request<Label>(`/labels/${id}`, json('PATCH', changes)),
    remove: (id: number) => request<void>(`/labels/${id}`, json('DELETE')),
  },
}
