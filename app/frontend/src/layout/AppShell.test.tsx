import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../test/fakeApi'
import { freezeTime, renderApp } from '../test/render'

beforeEach(freezeTime)

describe('AppShell and Sidebar', () => {
  it('shows navigation with counts for Inbox, Today, projects and labels', async () => {
    const api = createFakeApi()
    const project = api.addProject('Đồ án DevOps', 'red')
    const label = api.addLabel('khẩn')
    api.addTask('Inbox task')
    api.addTask('Due today', { due_date: '2026-10-16', project_id: project.id })
    api.addTask('Overdue', { due_date: '2026-10-01', labels: [{ id: label.id, name: 'khẩn', color: 'grey' }] })

    renderApp('/today', api)

    const nav = screen.getByRole('navigation', { name: 'Điều hướng chính' })
    expect(await within(nav).findByRole('link', { name: /Hộp thư đến\s*2\s*việc/ })).toBeInTheDocument()
    expect(await within(nav).findByRole('link', { name: /Hôm nay\s*2\s*việc/ })).toHaveAttribute(
      'aria-current',
      'page',
    )
    expect(within(nav).getByRole('link', { name: /Đồ án DevOps\s*1\s*việc/ })).toHaveAttribute(
      'href',
      `/project/${project.id}`,
    )
    expect(within(nav).getByRole('link', { name: /khẩn\s*1\s*việc/ })).toBeInTheDocument()
  })

  it('navigates between views from the sidebar', async () => {
    const { user } = renderApp('/today')

    await user.click(screen.getByRole('link', { name: /Sắp tới/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Sắp tới' })).toBeInTheDocument()

    await user.click(screen.getByRole('link', { name: /Hộp thư đến/ }))
    expect(await screen.findByRole('heading', { level: 1, name: 'Hộp thư đến' })).toBeInTheDocument()
    expect(document.title).toBe('Hộp thư đến · Taskapp')
  })

  it('redirects / to Today and shows a not-found page for unknown routes', async () => {
    renderApp('/')
    expect(await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })).toBeInTheDocument()
  })

  it('shows not found for an unknown project', async () => {
    renderApp('/project/999')
    expect(
      await screen.findByRole('heading', { level: 1, name: 'Không tìm thấy trang' }),
    ).toBeInTheDocument()
  })

  it('has a mobile menu button that controls the sidebar', async () => {
    const { user } = renderApp('/today')
    const button = screen.getByRole('button', { name: 'Mở menu' })
    expect(button).toHaveAttribute('aria-expanded', 'false')
    expect(button).toHaveAttribute('aria-controls', 'sidebar')

    await user.click(button)

    expect(screen.getByRole('button', { name: 'Đóng menu' })).toHaveAttribute('aria-expanded', 'true')
  })

  describe('keyboard shortcuts', () => {
    it('q opens quick add, Esc closes it', async () => {
      const { user } = renderApp('/today')
      await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })

      await user.keyboard('q')

      const dialog = await screen.findByRole('dialog', { name: 'Thêm nhanh công việc' })
      expect(within(dialog).getByLabelText('Tên công việc')).toHaveFocus()
      await user.keyboard('{Escape}')
      await waitFor(() => expect(dialog).not.toHaveAttribute('open'))
    })

    it('? opens the shortcuts help', async () => {
      const { user } = renderApp('/today')

      await user.keyboard('?')

      expect(await screen.findByRole('dialog', { name: 'Phím tắt' })).toBeInTheDocument()
      expect(screen.getByText('Thêm nhanh công việc')).toBeInTheDocument()
    })

    it('g then u goes to Upcoming, / goes to Search', async () => {
      const { user } = renderApp('/today')

      await user.keyboard('gu')
      expect(await screen.findByRole('heading', { level: 1, name: 'Sắp tới' })).toBeInTheDocument()

      await user.keyboard('/')
      expect(await screen.findByRole('heading', { level: 1, name: 'Tìm kiếm' })).toBeInTheDocument()
    })

    it('does not trigger while typing in an input', async () => {
      const { user } = renderApp('/search')

      await user.type(await screen.findByLabelText('Tìm công việc'), 'q')

      expect(screen.queryByRole('dialog', { name: 'Thêm nhanh công việc' })).not.toBeInTheDocument()
    })
  })

  it('creates a project from the sidebar and opens it', async () => {
    const { user, api } = renderApp('/today')

    await user.click(screen.getByRole('button', { name: 'Thêm dự án' }))
    const dialog = await screen.findByRole('dialog', { name: 'Thêm dự án' })
    await user.type(within(dialog).getByLabelText('Tên'), 'Học tập')
    await user.click(within(dialog).getByRole('radio', { name: 'Xanh lá' }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm' }))

    expect(await screen.findByRole('heading', { level: 1, name: 'Học tập' })).toBeInTheDocument()
    expect(api.state.projects.at(-1)).toMatchObject({ name: 'Học tập', color: 'green' })
  })
})
