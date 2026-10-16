import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import App from './App'
import { jsonResponse, makeTask } from './test/fixtures'

const fetchMock = vi.fn<typeof fetch>()

beforeEach(() => {
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset()
})

function lastCall() {
  const [url, init] = fetchMock.mock.calls.at(-1)!
  return { url, method: init?.method ?? 'GET', body: init?.body }
}

describe('App', () => {
  it('shows a loading state, then the tasks from GET /api/tasks', async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse([makeTask({ title: 'Từ API' })]))

    render(<App />)

    expect(screen.getByRole('status')).toHaveTextContent('Đang tải')
    expect(await screen.findByRole('checkbox', { name: 'Từ API' })).toBeInTheDocument()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', expect.anything())
  })

  it('shows an error with a retry button when loading fails', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(jsonResponse([makeTask({ title: 'Lần hai' })]))

    render(<App />)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được danh sách công việc')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByRole('checkbox', { name: 'Lần hai' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('creates a task with POST /api/tasks and shows it', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(jsonResponse(makeTask({ id: 7, title: 'Mới' }), 201))
    render(<App />)
    await screen.findByText(/Chưa có công việc nào/)

    await user.type(screen.getByLabelText('Công việc mới'), 'Mới{Enter}')

    expect(await screen.findByRole('checkbox', { name: 'Mới' })).toBeInTheDocument()
    expect(lastCall()).toEqual({ url: '/api/tasks', method: 'POST', body: '{"title":"Mới"}' })
  })

  it('shows the API validation message when creating fails', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse([]))
      .mockResolvedValueOnce(
        jsonResponse({ detail: [{ msg: 'String should have at most 200 characters' }] }, 422),
      )
    render(<App />)
    await screen.findByText(/Chưa có công việc nào/)

    await user.type(screen.getByLabelText('Công việc mới'), 'x{Enter}')

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'String should have at most 200 characters',
    )
  })

  it('toggles a task with PATCH /api/tasks/{id}', async () => {
    const user = userEvent.setup()
    const task = makeTask({ id: 3, title: 'Đánh dấu', done: false })
    fetchMock
      .mockResolvedValueOnce(jsonResponse([task]))
      .mockResolvedValueOnce(jsonResponse({ ...task, done: true }))
    render(<App />)

    await user.click(await screen.findByRole('checkbox', { name: 'Đánh dấu' }))

    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Đánh dấu' })).toBeChecked(),
    )
    expect(lastCall()).toEqual({ url: '/api/tasks/3', method: 'PATCH', body: '{"done":true}' })
  })

  it('deletes a task with DELETE /api/tasks/{id}', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse([makeTask({ id: 4, title: 'Xóa tôi' }), makeTask({ id: 5, title: 'Giữ' })]),
      )
      .mockResolvedValueOnce(new Response(null, { status: 204 }))
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Xóa công việc "Xóa tôi"' }))

    await waitFor(() =>
      expect(screen.queryByRole('checkbox', { name: 'Xóa tôi' })).not.toBeInTheDocument(),
    )
    expect(screen.getByRole('checkbox', { name: 'Giữ' })).toBeInTheDocument()
    expect(lastCall()).toMatchObject({ url: '/api/tasks/4', method: 'DELETE' })
  })

  it('reports an error and keeps the task when deleting fails', async () => {
    const user = userEvent.setup()
    fetchMock
      .mockResolvedValueOnce(jsonResponse([makeTask({ id: 6, title: 'Còn đây' })]))
      .mockResolvedValueOnce(jsonResponse({ detail: 'Task not found' }, 404))
    render(<App />)

    await user.click(await screen.findByRole('button', { name: 'Xóa công việc "Còn đây"' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Task not found')
    expect(screen.getByRole('checkbox', { name: 'Còn đây' })).toBeInTheDocument()
  })
})
