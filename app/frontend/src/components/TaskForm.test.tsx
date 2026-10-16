import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'
import { TaskForm } from './TaskForm'

function setup(onCreate = vi.fn().mockResolvedValue(undefined)) {
  const user = userEvent.setup()
  render(<TaskForm onCreate={onCreate} />)
  return {
    user,
    onCreate,
    input: screen.getByLabelText('Công việc mới'),
    button: screen.getByRole('button', { name: 'Thêm' }),
  }
}

describe('TaskForm', () => {
  it('has a labelled input and a clearly named submit button', () => {
    const { input, button } = setup()

    expect(input).toHaveAttribute('type', 'text')
    expect(input).toHaveAttribute('maxlength', '200')
    expect(button).toHaveAttribute('type', 'submit')
  })

  it('submits the trimmed title and clears the input', async () => {
    const { user, onCreate, input, button } = setup()

    await user.type(input, '  Học Docker  ')
    await user.click(button)

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Học Docker')
    expect(input).toHaveValue('')
  })

  it('can be submitted with the Enter key', async () => {
    const { user, onCreate, input } = setup()

    await user.type(input, 'Học Helm{Enter}')

    expect(onCreate).toHaveBeenCalledExactlyOnceWith('Học Helm')
  })

  it('shows an error and does not submit a blank title', async () => {
    const { user, onCreate, input, button } = setup()

    await user.type(input, '   ')
    await user.click(button)

    expect(onCreate).not.toHaveBeenCalled()
    expect(screen.getByRole('alert')).toHaveTextContent('Vui lòng nhập tên công việc')
    expect(input).toHaveAttribute('aria-invalid', 'true')
    expect(input).toHaveAccessibleDescription('Vui lòng nhập tên công việc.')
    expect(input).toHaveFocus()
  })

  it('clears the validation error once the user types again', async () => {
    const { user, input, button } = setup()

    await user.click(button)
    expect(screen.getByRole('alert')).toBeInTheDocument()

    await user.type(input, 'a')

    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(input).toHaveAttribute('aria-invalid', 'false')
  })

  it('disables the button while the request is in flight', async () => {
    let resolve!: () => void
    const onCreate = vi.fn(() => new Promise<void>((r) => (resolve = r)))
    const { user, input, button } = setup(onCreate)

    await user.type(input, 'Chậm')
    await user.click(button)

    expect(button).toBeDisabled()
    expect(button).toHaveTextContent('Đang thêm')

    resolve()
    expect(await screen.findByRole('button', { name: 'Thêm' })).toBeEnabled()
  })

  it('keeps the text and shows the error when creating fails', async () => {
    const onCreate = vi.fn().mockRejectedValue(new Error('Máy chủ lỗi'))
    const { user, input, button } = setup(onCreate)

    await user.type(input, 'Sẽ lỗi')
    await user.click(button)

    expect(await screen.findByRole('alert')).toHaveTextContent('Máy chủ lỗi')
    expect(input).toHaveValue('Sẽ lỗi')
  })
})
