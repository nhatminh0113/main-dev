import { useId, useRef, useState, type FormEvent } from 'react'
import { TITLE_MAX_LENGTH } from '../types'

interface TaskFormProps {
  /** Resolves when the task is saved; rejects with an Error whose message is shown. */
  onCreate: (title: string) => Promise<void>
}

export function TaskForm({ onCreate }: TaskFormProps) {
  const inputId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const [title, setTitle] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const trimmed = title.trim()
    if (!trimmed) {
      setError('Vui lòng nhập tên công việc.')
      inputRef.current?.focus()
      return
    }

    setSubmitting(true)
    setError(null)
    try {
      await onCreate(trimmed)
      setTitle('')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thêm được công việc.')
    } finally {
      setSubmitting(false)
      inputRef.current?.focus()
    }
  }

  return (
    <form className="task-form" onSubmit={handleSubmit} noValidate>
      <label htmlFor={inputId} className="task-form__label">
        Công việc mới
      </label>
      <div className="task-form__row">
        <input
          ref={inputRef}
          id={inputId}
          type="text"
          className="input"
          value={title}
          maxLength={TITLE_MAX_LENGTH}
          placeholder="Ví dụ: Viết Helm chart"
          autoComplete="off"
          aria-invalid={error !== null}
          aria-describedby={error ? errorId : undefined}
          onChange={(e) => {
            setTitle(e.target.value)
            setError(null)
          }}
        />
        <button type="submit" className="button button--primary" disabled={submitting}>
          {submitting ? 'Đang thêm…' : 'Thêm'}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="task-form__error">
          {error}
        </p>
      )}
    </form>
  )
}
