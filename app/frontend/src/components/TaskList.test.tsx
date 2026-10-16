import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { makeTask } from '../test/fixtures'
import { TaskList } from './TaskList'

const tasks = [
  makeTask({ id: 1, title: 'Học Docker', done: true }),
  makeTask({ id: 2, title: 'Học Kubernetes', done: false }),
]

function setup(props: Partial<Parameters<typeof TaskList>[0]> = {}) {
  const user = userEvent.setup()
  const onToggle = vi.fn()
  const onDelete = vi.fn()
  render(<TaskList tasks={tasks} onToggle={onToggle} onDelete={onDelete} {...props} />)
  return { user, onToggle, onDelete }
}

describe('TaskList', () => {
  it('renders every task as a list item', () => {
    setup()

    const list = screen.getByRole('list', { name: 'Danh sách công việc' })
    const items = within(list).getAllByRole('listitem')
    expect(items).toHaveLength(2)
    expect(items[0]).toHaveTextContent('Học Docker')
    expect(items[1]).toHaveTextContent('Học Kubernetes')
  })

  it('shows each task state with a labelled checkbox', () => {
    setup()

    expect(screen.getByRole('checkbox', { name: 'Học Docker' })).toBeChecked()
    expect(screen.getByRole('checkbox', { name: 'Học Kubernetes' })).not.toBeChecked()
  })

  it('shows how many tasks are done', () => {
    setup()

    expect(screen.getByText('1/2 việc đã xong')).toBeInTheDocument()
  })

  it('shows an empty state when there are no tasks', () => {
    setup({ tasks: [] })

    expect(screen.getByText('Chưa có công việc nào. Hãy thêm việc đầu tiên.')).toBeInTheDocument()
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })

  it('calls onToggle when a checkbox is clicked', async () => {
    const { user, onToggle } = setup()

    await user.click(screen.getByRole('checkbox', { name: 'Học Kubernetes' }))

    expect(onToggle).toHaveBeenCalledExactlyOnceWith(tasks[1])
  })

  it('can toggle with the keyboard (Space)', async () => {
    const { user, onToggle } = setup()

    await user.tab()
    expect(screen.getByRole('checkbox', { name: 'Học Docker' })).toHaveFocus()
    await user.keyboard(' ')

    expect(onToggle).toHaveBeenCalledExactlyOnceWith(tasks[0])
  })

  it('has a delete button per task whose name includes the task title', async () => {
    const { user, onDelete } = setup()

    const button = screen.getByRole('button', { name: 'Xóa công việc "Học Docker"' })
    expect(button).toHaveTextContent('Xóa')
    await user.click(button)

    expect(onDelete).toHaveBeenCalledExactlyOnceWith(tasks[0])
  })

  it('disables the controls of a task that is being saved', () => {
    setup({ busyIds: new Set([2]) })

    expect(screen.getByRole('checkbox', { name: 'Học Kubernetes' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Xóa công việc "Học Kubernetes"' })).toBeDisabled()
    expect(screen.getByRole('checkbox', { name: 'Học Docker' })).toBeEnabled()
  })
})
