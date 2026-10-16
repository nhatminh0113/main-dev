import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../test/fakeApi'
import { freezeTime, renderApp } from '../test/render'

beforeEach(freezeTime)

const section = (name: RegExp | string) => screen.getByRole('region', { name })

describe('TodayView', () => {
  it('groups overdue and today tasks with the project shown', async () => {
    const api = createFakeApi()
    const project = api.addProject('Đồ án DevOps')
    api.addTask('Sửa probe', { due_date: '2026-10-14', project_id: project.id, priority: 1 })
    api.addTask('Viết chart', { due_date: '2026-10-16' })
    api.addTask('Ngày mai', { due_date: '2026-10-17' })

    renderApp('/today', api)

    expect(await screen.findByText('Thứ Sáu, 16 tháng 10 · 2 việc')).toBeInTheDocument()
    const overdue = section(/Quá hạn/)
    expect(within(overdue).getByRole('button', { name: 'Sửa probe' })).toBeInTheDocument()
    expect(within(overdue).getByText('14 thg 10')).toBeInTheDocument()
    expect(within(overdue).getByText('Đồ án DevOps')).toBeInTheDocument()
    const today = section(/16 thg 10 · Hôm nay · Thứ Sáu/)
    expect(within(today).getByRole('button', { name: 'Viết chart' })).toBeInTheDocument()
    expect(screen.queryByText('Ngày mai', { selector: 'button' })).not.toBeInTheDocument()
  })

  it('reschedules all overdue tasks to today', async () => {
    const api = createFakeApi()
    api.addTask('Cũ 1', { due_date: '2026-10-10' })
    api.addTask('Cũ 2', { due_date: '2026-10-12' })
    const { user } = renderApp('/today', api)

    await user.click(await screen.findByRole('button', { name: 'Lên lịch lại' }))

    await waitFor(() => expect(screen.queryByRole('region', { name: /Quá hạn/ })).not.toBeInTheDocument())
    expect(api.state.tasks.map((t) => t.due_date)).toEqual(['2026-10-16', '2026-10-16'])
    expect(await screen.findByText('Đã dời 2 việc sang hôm nay')).toBeInTheDocument()
  })

  it('completes a task optimistically and can undo it', async () => {
    const api = createFakeApi()
    api.addTask('Học Helm', { due_date: '2026-10-16' })
    const { user } = renderApp('/today', api)

    await user.click(await screen.findByRole('checkbox', { name: 'Hoàn thành “Học Helm”' }))

    await waitFor(() =>
      expect(screen.queryByRole('button', { name: 'Học Helm' })).not.toBeInTheDocument(),
    )
    expect(api.state.tasks[0].done).toBe(true)
    expect(screen.getByRole('status', { name: '' })).toHaveTextContent('Đã hoàn thành “Học Helm”')

    await user.click(screen.getByRole('button', { name: 'Hoàn tác' }))

    expect(await screen.findByRole('button', { name: 'Học Helm' })).toBeInTheDocument()
    expect(api.state.tasks[0].done).toBe(false)
  })

  it('rolls back and reports the error when completing fails', async () => {
    const api = createFakeApi()
    api.addTask('Không xong', { due_date: '2026-10-16' })
    api.failNext('PATCH', '/api/tasks', 500, 'Máy chủ lỗi')
    const { user } = renderApp('/today', api)

    await user.click(await screen.findByRole('checkbox', { name: 'Hoàn thành “Không xong”' }))

    expect(await screen.findByText('Máy chủ lỗi')).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: 'Không xong' })).toBeInTheDocument()
  })

  it('shows an empty state when nothing is due', async () => {
    renderApp('/today')
    expect(await screen.findByText('Bạn đã xong mọi việc hôm nay')).toBeInTheDocument()
  })

  it('shows an error with retry when loading fails', async () => {
    const api = createFakeApi()
    api.failNext('GET', '/api/tasks', 500, 'Hết giờ')
    const { user } = renderApp('/today', api)

    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Không tải được dữ liệu')
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))

    expect(await screen.findByText('Bạn đã xong mọi việc hôm nay')).toBeInTheDocument()
  })
})

describe('UpcomingView', () => {
  it('lists the next 7 days with tasks grouped per day', async () => {
    const api = createFakeApi()
    api.addTask('Thứ 7 đá bóng', { due_date: '2026-10-17' })
    api.addTask('Thứ 5 họp', { due_date: '2026-10-22' })
    api.addTask('Quá xa', { due_date: '2026-10-23' })
    renderApp('/upcoming', api)

    await screen.findByRole('button', { name: 'Thứ 7 đá bóng' })
    const headings = within(screen.getByRole('main'))
      .getAllByRole('heading', { level: 2 })
      .map((h) => h.textContent)
    expect(headings).toEqual([
      '16 thg 10 · Hôm nay · Thứ Sáu0 việc',
      '17 thg 10 · Ngày mai · Thứ Bảy1 việc',
      '18 thg 10 · Chủ Nhật0 việc',
      '19 thg 10 · Thứ Hai0 việc',
      '20 thg 10 · Thứ Ba0 việc',
      '21 thg 10 · Thứ Tư0 việc',
      '22 thg 10 · Thứ Năm1 việc',
    ])
    expect(screen.queryByText('Quá xa')).not.toBeInTheDocument()
  })

  it('adds a task to a specific day from that day section', async () => {
    const { user, api } = renderApp('/upcoming')
    const monday = await screen.findByRole('region', { name: /19 thg 10 · Thứ Hai/ })

    await user.click(within(monday).getByRole('button', { name: 'Thêm công việc' }))
    await user.type(within(monday).getByLabelText('Tên công việc'), 'Họp đầu tuần{Enter}')

    await waitFor(() => expect(api.state.tasks).toHaveLength(1))
    expect(api.state.tasks[0]).toMatchObject({ title: 'Họp đầu tuần', due_date: '2026-10-19' })
  })
})

describe('Project, label, completed and search views', () => {
  it('shows a project with its open top-level tasks and edits it', async () => {
    const api = createFakeApi()
    const project = api.addProject('Đồ án')
    const parent = api.addTask('Cha', { project_id: project.id })
    api.addTask('Con', { project_id: project.id, parent_id: parent.id })
    api.addTask('Xong', { project_id: project.id, done: true })
    const { user } = renderApp(`/project/${project.id}`, api)

    expect(await screen.findByRole('button', { name: 'Cha' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Con' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Xong' })).not.toBeInTheDocument()
    expect(screen.getByText('0/1', { exact: false })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: /Sửa dự án/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Sửa dự án' })
    await user.click(within(dialog).getByRole('button', { name: 'Xóa dự án' }))
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Ghi nhanh' })).toBeInTheDocument()
    expect(api.state.projects).toHaveLength(1)
  })

  it('shows the Inbox empty state', async () => {
    renderApp('/inbox')
    expect(await screen.findByText('Chưa có ghi chú nào')).toBeInTheDocument()
  })

  it('shows tasks with a label', async () => {
    const api = createFakeApi()
    const label = api.addLabel('khẩn', 'red')
    api.addTask('Gắp', { labels: [{ id: label.id, name: 'khẩn', color: 'red' }] })
    api.addTask('Không nhãn')
    renderApp(`/label/${label.id}`, api)

    expect(await screen.findByRole('button', { name: 'Gắp' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Không nhãn' })).not.toBeInTheDocument()
    expect(screen.getByText('@khẩn')).toBeInTheDocument()
  })

  it('lists completed tasks grouped by day and can reopen one', async () => {
    const api = createFakeApi()
    api.addTask('Đã làm', { done: true, completed_at: '2026-10-16T08:00:00' })
    const { user } = renderApp('/completed', api)

    expect(await screen.findByRole('region', { name: /16 thg 10 · Hôm nay/ })).toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'Bỏ hoàn thành “Đã làm”' }))

    await waitFor(() => expect(api.state.tasks[0].done).toBe(false))
  })

  it('searches through the API and keeps the query in the URL', async () => {
    const api = createFakeApi()
    api.addTask('Học Docker')
    api.addTask('Mua sữa')
    const { user } = renderApp('/search', api)

    await user.type(await screen.findByLabelText('Tìm công việc'), 'docker')

    expect(await screen.findByRole('button', { name: 'Học Docker' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Mua sữa' })).not.toBeInTheDocument()
    expect(api.fetch).toHaveBeenCalledWith('/api/tasks?q=docker&limit=100', expect.anything())

    await user.clear(screen.getByLabelText('Tìm công việc'))
    await user.type(screen.getByLabelText('Tìm công việc'), 'zzz')
    expect(await screen.findByText('Không tìm thấy “zzz”')).toBeInTheDocument()
  })
})
