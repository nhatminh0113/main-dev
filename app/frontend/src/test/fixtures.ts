import type { Task } from '../types'

export function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 1,
    title: 'Viết test',
    done: false,
    created_at: '2026-10-16T10:00:00Z',
    ...overrides,
  }
}

/** Build a fetch Response with a JSON body. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  })
}
