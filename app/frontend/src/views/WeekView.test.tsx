import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../test/fakeApi'
import { freezeTime, renderApp } from '../test/render'

beforeEach(freezeTime) // Friday 16 Oct 2026, 09:00

function seed() {
  const api = createFakeApi()
  const project = api.addProject('Đồ án DevOps', 'red')
  api.addTask('Viết Helm chart', {
    due_date: '2026-10-16',
    due_time: '09:00:00',
    duration_minutes: 120,
    project_id: project.id,
    priority: 2,
  })
  api.addTask('Họp nhóm', { due_date: '2026-10-13', due_time: '13:00:00', duration_minutes: 90 })
  api.addTask('Mua sữa', { due_date: '2026-10-16' })
  api.addTask('Tuần sau', { due_date: '2026-10-20', due_time: '08:00:00' })
  return { api, project }
}

describe('WeekView', () => {
  it('shows Monday–Sunday of the current week with today marked', async () => {
    renderApp('/week', seed().api)

    expect(await screen.findByText(/Tuần 42 · 12 – 18 tháng 10, 2026 · 3 việc chưa xong/)).toBeInTheDocument()
    for (const day of ['Thứ Hai 12/10', 'Thứ Sáu 16/10', 'Chủ Nhật 18/10']) {
      expect(screen.getByRole('button', { name: `Thêm việc vào ${day}` })).toBeInTheDocument()
    }
    expect(screen.getByText('· Hôm nay')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Tuần này' })).toBeDisabled()
  })

  it('places timed tasks in the hour grid and untimed ones in the all-day row', async () => {
    renderApp('/week', seed().api)

    const friday = await screen.findByRole('list', { name: 'Lịch giờ, Thứ Sáu 16/10' })
    const block = within(friday).getByRole('button', {
      name: 'Viết Helm chart, Thứ Sáu 09:00 – 11:00, Đồ án DevOps',
    })
    // 09:00 at 48px/hour, 2 hours tall
    const slot = block.closest('li')!
    expect(slot).toHaveStyle({ top: '432px', height: '94px' })

    const allDay = screen.getByRole('list', { name: 'Cả ngày, Thứ Sáu 16/10' })
    expect(within(allDay).getByRole('button', { name: /^Mua sữa, Thứ Sáu, cả ngày/ })).toBeInTheDocument()

    const tuesday = screen.getByRole('list', { name: 'Lịch giờ, Thứ Ba 13/10' })
    expect(within(tuesday).getByRole('button', { name: /Họp nhóm, Thứ Ba 13:00 – 14:30/ })).toBeInTheDocument()
    expect(screen.queryByText('Tuần sau')).not.toBeInTheDocument()
  })

  it('navigates to the next week and back', async () => {
    const { user } = renderApp('/week', seed().api)
    await screen.findByText(/Tuần 42/)

    await user.click(screen.getByRole('button', { name: 'Tuần sau' }))

    expect(await screen.findByText(/Tuần 43 · 19 – 25 tháng 10, 2026/)).toBeInTheDocument()
    expect(await screen.findByRole('button', { name: /^Tuần sau, Thứ Ba 08:00 – 09:00/ })).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Tuần này' }))
    expect(await screen.findByText(/Tuần 42/)).toBeInTheDocument()
  })

  it('opens the week of a ?start= date and formats a month boundary', async () => {
    renderApp('/week?start=2026-10-01')
    expect(await screen.findByText(/Tuần 40 · 28\/9 – 4\/10, 2026/)).toBeInTheDocument()
  })

  it('adds a task to a day from its header button with the date preset', async () => {
    const { user, api } = renderApp('/week', seed().api)

    await user.click(await screen.findByRole('button', { name: 'Thêm việc vào Thứ Tư 14/10' }))
    const dialog = await screen.findByRole('dialog', { name: 'Thêm nhanh công việc' })
    await user.type(within(dialog).getByLabelText('Tên công việc'), 'Ôn tập 14h trong 90p{Enter}')

    await waitFor(() => expect(api.state.tasks.at(-1)?.title).toBe('Ôn tập'))
    expect(api.state.tasks.at(-1)).toMatchObject({
      due_date: '2026-10-14',
      due_time: '14:00:00',
      duration_minutes: 90,
    })
  })

  it('completes a task from its block', async () => {
    const { api } = seed()
    const { user } = renderApp('/week', api)

    await user.click(await screen.findByRole('checkbox', { name: 'Hoàn thành “Viết Helm chart”' }))

    await waitFor(() => expect(api.state.tasks[0].done).toBe(true))
    expect(await screen.findByRole('button', { name: /Viết Helm chart, .*, đã xong/ })).toBeInTheDocument()
  })

  it('opens the task dialog from a block and edits the time', async () => {
    const { api } = seed()
    const { user } = renderApp('/week', api)

    await user.click(await screen.findByRole('button', { name: /^Viết Helm chart, Thứ Sáu/ }))
    const dialog = await screen.findByRole('dialog', { name: 'Viết Helm chart' })
    await user.click(within(dialog).getByRole('button', { name: 'Giờ: 09:00 · 2 giờ' }))
    await user.selectOptions(await within(dialog).findByLabelText('Thời lượng'), '45')

    await waitFor(() => expect(api.state.tasks[0].duration_minutes).toBe(45))
  })

  it('is reachable from the sidebar and with "g w"', async () => {
    const { user } = renderApp('/today')
    await screen.findByRole('heading', { level: 1, name: 'Hôm nay' })

    await user.keyboard('gw')

    expect(await screen.findByRole('heading', { level: 1, name: 'Lịch tuần' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Lịch tuần/ })).toHaveAttribute('aria-current', 'page')
  })
})
