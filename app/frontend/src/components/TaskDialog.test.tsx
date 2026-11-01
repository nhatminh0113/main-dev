import { screen, waitFor, within } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
import { createFakeApi } from '../test/fakeApi'
import { freezeTime, renderApp } from '../test/render'

beforeEach(freezeTime)

async function openTask(title: string, api = createFakeApi()) {
  const utils = renderApp('/inbox', api)
  await utils.user.click(await screen.findByRole('button', { name: title }))
  const dialog = await screen.findByRole('dialog', { name: title })
  return { ...utils, dialog }
}

describe('TaskDialog', () => {
  it('edits title and description with explicit save', async () => {
    const api = createFakeApi()
    api.addTask('Cũ')
    const { user, dialog } = await openTask('Cũ', api)

    const title = within(dialog).getByLabelText('Tên công việc')
    await user.clear(title)
    await user.type(title, 'Mới')
    await user.type(within(dialog).getByLabelText('Mô tả'), 'Chi tiết')
    await user.click(within(dialog).getByRole('button', { name: 'Lưu' }))

    await waitFor(() =>
      expect(api.state.tasks[0]).toMatchObject({ title: 'Mới', description: 'Chi tiết' }),
    )
  })

  it('changes priority, due date and labels from the side panel', async () => {
    const api = createFakeApi()
    api.addLabel('khẩn')
    api.addTask('Việc')
    const { user, dialog } = await openTask('Việc', api)

    await user.click(within(dialog).getByRole('button', { name: 'Mức ưu tiên: Ưu tiên 4' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Ưu tiên 1' }))
    await waitFor(() => expect(api.state.tasks[0].priority).toBe(1))

    await user.click(within(dialog).getByRole('button', { name: 'Ngày hết hạn: chưa có' }))
    await user.click(await within(dialog).findByRole('button', { name: 'Ngày mai' }))
    await waitFor(() => expect(api.state.tasks[0].due_date).toBe('2026-10-17'))

    await user.click(within(dialog).getByRole('button', { name: 'Nhãn: chưa có' }))
    await user.click(await within(dialog).findByRole('checkbox', { name: 'khẩn' }))
    await waitFor(() => expect(api.state.tasks[0].labels.map((l) => l.name)).toEqual(['khẩn']))
  })

  it('adds a subtask', async () => {
    const api = createFakeApi()
    api.addTask('Cha')
    const { user, dialog } = await openTask('Cha', api)

    await user.click(within(dialog).getByRole('button', { name: 'Thêm công việc con' }))
    await user.type(within(dialog).getByLabelText('Tên công việc con'), 'Con 1{Enter}')

    const list = await within(dialog).findByRole('list', { name: 'Công việc con' })
    expect(within(list).getByRole('button', { name: 'Con 1' })).toBeInTheDocument()
    expect(api.state.tasks[1]).toMatchObject({ title: 'Con 1', parent_id: api.state.tasks[0].id })
  })

  it('deletes after confirmation', async () => {
    const api = createFakeApi()
    api.addTask('Bỏ đi')
    const { user, dialog } = await openTask('Bỏ đi', api)

    await user.click(within(dialog).getByRole('button', { name: 'Xóa công việc' }))
    expect(within(dialog).getByText('Xóa công việc này?')).toBeInTheDocument()
    await user.click(within(dialog).getByRole('button', { name: 'Xóa' }))

    await waitFor(() => expect(api.state.tasks).toHaveLength(0))
    expect(await screen.findByText('Đã xóa “Bỏ đi”')).toBeInTheDocument()
  })
})
