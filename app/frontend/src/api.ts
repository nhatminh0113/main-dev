import type { Task } from './types'

/** Error returned by the API (non-2xx) or raised when the server is unreachable. */
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

/** FastAPI returns `detail` as a string (404) or a list of validation errors (422). */
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

export const api = {
  listTasks: () => request<Task[]>('/tasks'),

  createTask: (title: string) =>
    request<Task>('/tasks', { method: 'POST', body: JSON.stringify({ title }) }),

  updateTask: (id: number, changes: Partial<Pick<Task, 'title' | 'done'>>) =>
    request<Task>(`/tasks/${id}`, { method: 'PATCH', body: JSON.stringify(changes) }),

  deleteTask: (id: number) => request<void>(`/tasks/${id}`, { method: 'DELETE' }),
}
