import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../test/fakeApi'
import { freezeTime, renderApp } from '../test/render'

beforeEach(freezeTime)

async function openQuickAdd(route = '/inbox', api = createFakeApi()) {
  const utils = renderApp(route, api)
  await screen.findByRole('heading', { level: 1 })
  await utils.user.click(screen.getByRole('button', { name: /^Thêm công việc/ }))
  const dialog = await screen.findByRole('dialog', { name: 'Thêm nhanh công việc' })
  const input = within(dialog).getByLabelText('Tên công việc')
  return { ...utils, dialog, input }
}

describe('QuickAdd', () => {
  it('parses natural language, creates new labels and posts the task', async () => {
    const api = createFakeApi()
    const project = api.addProject('Đồ án DevOps', 'red')
    api.addLabel('khẩn')
    const { user, dialog, input } = await openQuickAdd('/inbox', api)

    await user.type(input, 'Nộp báo cáo mai p1 #DoAnDevOps @khẩn @mới')

    expect(within(dialog).getByText(/Đã nhận diện: ngày mai, ưu tiên p1/)).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Ngày hết hạn: Ngày mai' })).toBeInTheDocument()
    expect(within(dialog).getByRole('button', { name: 'Mức ưu tiên: Ưu tiên 1' })).toBeInTheDocument()
    expect(within(dialog).getByRole('combobox', { name: 'Dự án' })).toHaveValue(String(project.id))
    expect(within(dialog).getByText('Nhãn mới: mới')).toBeInTheDocument()

    await user.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))

    await waitFor(() => expect(api.state.tasks).toHaveLength(1))
    expect(api.state.labels.map((l) => l.name)).toEqual(['khẩn', 'mới'])
    expect(api.state.tasks[0]).toMatchObject({
      title: 'Nộp báo cáo',
      due_date: '2026-10-17',
      priority: 1,
      project_id: project.id,
    })
    expect(api.state.tasks[0].labels.map((l) => l.name)).toEqual(['khẩn', 'mới'])
    expect(input).toHaveValue('')
    expect(await screen.findByText('Đã thêm vào Đồ án DevOps')).toBeInTheDocument()
  })

  it('× keeps a recognised word in the title instead of using it as a date', async () => {
    const { user, dialog, input, api } = await openQuickAdd()

    await user.type(input, 'Họp với Mai')
    await user.click(within(dialog).getByRole('button', { name: 'Bỏ ngày Ngày mai' }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))

    await waitFor(() => expect(api.state.tasks).toHaveLength(1))
    expect(api.state.tasks[0]).toMatchObject({ title: 'Họp với Mai', due_date: null })
  })

  it('a picker choice replaces the typed word', async () => {
    const { user, dialog, input, api } = await openQuickAdd()

    await user.type(input, 'Gọi điện p3')
    await user.click(within(dialog).getByRole('button', { name: 'Mức ưu tiên: Ưu tiên 3' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Ưu tiên 2' }))

    expect(input).toHaveValue('Gọi điện ')
    await user.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))
    await waitFor(() => expect(api.state.tasks[0]).toMatchObject({ title: 'Gọi điện', priority: 2 }))
  })

  it('picks a due date from the date popover', async () => {
    const { user, dialog, input, api } = await openQuickAdd()

    await user.type(input, 'Dọn nhà')
    await user.click(within(dialog).getByRole('button', { name: 'Ngày hết hạn: chưa có' }))
    const popover = await within(dialog).findByRole('dialog', { name: 'Chọn ngày hết hạn' })
    await user.click(within(popover).getByRole('button', { name: /Cuối tuần này/ }))
    await user.click(within(dialog).getByRole('button', { name: 'Thêm việc' }))

    await waitFor(() => expect(api.state.tasks[0]).toMatchObject({ due_date: '2026-10-17' }))
  })

  it('cannot submit when the title is empty after parsing', async () => {
    const { user, dialog, input } = await openQuickAdd()

    await user.type(input, 'mai p1')

    expect(within(dialog).getByRole('button', { name: 'Thêm việc' })).toBeDisabled()
  })

  it('shows the API error and keeps the text', async () => {
    const api = createFakeApi()
    api.failNext('POST', '/api/tasks', 422, 'Project 9 does not exist')
    const { user, dialog, input } = await openQuickAdd('/inbox', api)

    await user.type(input, 'Lỗi{Enter}')

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Project 9 does not exist')
    expect(input).toHaveValue('Lỗi')
    expect(input).toHaveAttribute('aria-invalid', 'true')
  })
})
