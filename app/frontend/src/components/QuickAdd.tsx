import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type ReactNode,
} from 'react'
import { useCreateTask, useLabels, useProjects, useSaveLabel } from '../api/hooks'
import { TITLE_MAX_LENGTH, type Priority, type Task } from '../api/types'
import { useUI, type QuickAddDefaults } from '../layout/ui'
import { describeDue } from '../lib/dates'
import { PRIORITY_LABEL } from '../lib/priority'
import { parseQuickAdd, type QuickAddToken, type TokenType } from '../lib/quickAdd'
import { fromMinutes } from '../lib/time'
import { useToday } from '../lib/useToday'
import { CloseIcon } from './icons'
import { DuePicker, LabelPicker, PriorityPicker, ProjectSelect, TimePicker, type TimeValue } from './pickers'
import styles from './QuickAdd.module.css'
import { useToast } from './Toast'

interface QuickAddProps {
  defaults?: QuickAddDefaults
  onClose?: () => void
  onCreated?: (task: Task) => void
  /** Focus the title input when the editor appears (it is always opened by a user action). */
  focusOnMount?: boolean
  /** Show the syntax hint below the editor (used in the quick add dialog). */
  showHint?: boolean
}

const TOKEN_NAMES: Record<TokenType, string> = {
  date: 'ngày',
  time: 'giờ',
  duration: 'thời lượng',
  priority: 'ưu tiên',
  project: 'dự án',
  label: 'nhãn',
}

/** Remove tokens' text from the input (in one pass) and tidy up the spaces around them. */
function cut(text: string, ...tokens: QuickAddToken[]): string {
  let out = ''
  let cursor = 0
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    out += text.slice(cursor, token.start)
    cursor = token.end
  }
  return (out + text.slice(cursor)).replace(/\s{2,}/g, ' ')
}

export function QuickAdd({
  defaults = {},
  onClose,
  onCreated,
  focusOnMount,
  showHint = false,
}: QuickAddProps) {
  const today = useToday()
  const toast = useToast()
  const { openTask } = useUI()
  const { data: projects = [] } = useProjects()
  const { data: labels = [] } = useLabels()
  const createTask = useCreateTask()
  const saveLabel = useSaveLabel()

  const titleId = useId()
  const descriptionId = useId()
  const summaryId = useId()
  const errorId = useId()
  const inputRef = useRef<HTMLInputElement>(null)
  const mirrorRef = useRef<HTMLDivElement>(null)

  const [text, setText] = useState('')
  const [description, setDescription] = useState('')
  const [ignored, setIgnored] = useState<ReadonlySet<string>>(new Set())
  // undefined = not chosen explicitly (fall back to parsed text, then defaults)
  const [explicitDue, setExplicitDue] = useState<string | null | undefined>(undefined)
  const [explicitPriority, setExplicitPriority] = useState<Priority | undefined>(undefined)
  const [explicitProject, setExplicitProject] = useState<number | undefined>(undefined)
  const [explicitLabels, setExplicitLabels] = useState<number[] | undefined>(undefined)
  const [explicitTime, setExplicitTime] = useState<TimeValue | undefined>(undefined)
  const [error, setError] = useState<string | null>(null)

  const parsed = useMemo(
    () => {
      const now = new Date()
      return parseQuickAdd(text, {
        today,
        projects,
        labels,
        ignore: ignored,
        now: fromMinutes(now.getHours() * 60 + now.getMinutes()),
        defaultDate: defaults.dueDate,
      })
    },
    [text, today, projects, labels, ignored, defaults.dueDate],
  )
  const tokenOf = (type: TokenType) => parsed.tokens.find((t) => t.type === type)

  const isSubtask = defaults.parentId !== undefined
  const inboxId = projects.find((p) => p.is_inbox)?.id
  const dueDate =
    explicitDue !== undefined ? explicitDue : (parsed.dueDate ?? defaults.dueDate ?? null)
  const time = explicitTime ? explicitTime.time : (parsed.dueTime ?? defaults.dueTime ?? null)
  const duration = explicitTime
    ? explicitTime.duration
    : (parsed.duration ?? defaults.duration ?? null)
  // A time only makes sense with a date (the API enforces the same rule).
  const dueTime = dueDate ? time : null
  const priority: Priority = explicitPriority ?? parsed.priority ?? defaults.priority ?? 4
  const projectId = explicitProject ?? parsed.projectId ?? defaults.projectId ?? inboxId
  const labelIds =
    explicitLabels ??
    [
      ...new Set([
        ...(defaults.labelIds ?? []),
        ...parsed.labels.flatMap((l) => (l.id === null ? [] : [l.id])),
      ]),
    ]
  const newLabels = explicitLabels ? [] : parsed.labels.filter((l) => l.id === null)
  const busy = createTask.isPending || saveLabel.isPending

  // Keep the highlight layer scrolled exactly like the input.
  useLayoutEffect(() => {
    if (mirrorRef.current && inputRef.current) {
      mirrorRef.current.scrollLeft = inputRef.current.scrollLeft
    }
  })

  /** A picker choice wins over (and removes) the matching word in the text. */
  const overrideToken = (type: TokenType) => {
    const token = tokenOf(type)
    if (token) setText(cut(text, token))
  }

  /** "×" on a chip: forget the value but keep the word as part of the title. */
  const ignoreToken = (type: TokenType) => {
    const token = tokenOf(type)
    if (token) setIgnored((prev) => new Set(prev).add(token.key))
  }

  const reset = () => {
    setText('')
    setDescription('')
    setIgnored(new Set())
    setExplicitDue(undefined)
    setExplicitPriority(undefined)
    setExplicitProject(undefined)
    setExplicitLabels(undefined)
    setExplicitTime(undefined)
    setError(null)
  }

  async function handleSubmit(event: FormEvent) {
    event.preventDefault()
    if (!parsed.title || busy) return
    setError(null)
    try {
      const createdLabelIds: number[] = []
      for (const label of newLabels) {
        createdLabelIds.push((await saveLabel.mutateAsync({ name: label.name, color: 'grey' })).id)
      }
      const task = await createTask.mutateAsync({
        title: parsed.title,
        description: description.trim(),
        priority,
        due_date: dueDate,
        due_time: dueTime,
        duration_minutes: dueTime ? duration : null,
        ...(isSubtask ? { parent_id: defaults.parentId } : { project_id: projectId }),
        label_ids: [...labelIds, ...createdLabelIds],
      })
      reset()
      onCreated?.(task)
      const where = projects.find((p) => p.id === task.project_id)?.name
      toast({
        message: where ? `Đã thêm vào ${where}` : 'Đã thêm công việc',
        action: { label: 'Mở', onClick: () => openTask(task.id) },
      })
      inputRef.current?.focus()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Không thêm được công việc.')
    }
  }

  const summary = parsed.tokens
    .map((t) => `${TOKEN_NAMES[t.type]} ${t.text.replace(/^[#@]/, '')}`)
    .join(', ')

  return (
    <form className={styles.editor} onSubmit={handleSubmit} aria-label="Thêm công việc">
      <div className={styles.fields}>
        <label htmlFor={titleId} className="visually-hidden">
          {isSubtask ? 'Tên công việc con' : 'Tên công việc'}
        </label>
        <div className={styles.titleWrap}>
          {/* Visual highlight of recognised words; the real (transparent) input sits on top. */}
          <div ref={mirrorRef} className={styles.mirror} aria-hidden="true">
            {renderHighlights(text, parsed.tokens)}
          </div>
          <input
            ref={inputRef}
            id={titleId}
            className={styles.title}
            value={text}
            maxLength={TITLE_MAX_LENGTH + 100}
            placeholder={isSubtask ? 'Tên công việc con' : 'Ví dụ: Nộp báo cáo mai p1 #DuAn @nhan'}
            autoComplete="off"
            // The native attribute is honoured by <dialog>.showModal(); the editor only
            // appears after an explicit user action, so moving focus is expected.
            // eslint-disable-next-line jsx-a11y-x/no-autofocus
            autoFocus={focusOnMount}
            data-autofocus={focusOnMount || undefined}
            aria-describedby={[summary ? summaryId : '', error ? errorId : ''].join(' ').trim() || undefined}
            aria-invalid={error !== null}
            onChange={(e) => {
              setText(e.target.value)
              setError(null)
            }}
            onScroll={(e) => {
              if (mirrorRef.current) mirrorRef.current.scrollLeft = e.currentTarget.scrollLeft
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape' && onClose) {
                e.preventDefault()
                e.stopPropagation()
                onClose()
              }
            }}
          />
        </div>
        {summary && (
          <p id={summaryId} className="visually-hidden">
            Đã nhận diện: {summary}
          </p>
        )}

        <label htmlFor={descriptionId} className="visually-hidden">
          Mô tả
        </label>
        <textarea
          id={descriptionId}
          className={styles.description}
          rows={1}
          placeholder="Mô tả"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
        />

        <div className={styles.chips}>
          <span className={styles.chipGroup}>
            <DuePicker
              value={dueDate}
              onChange={(d) => {
                overrideToken('date')
                setExplicitDue(d)
              }}
            />
            {dueDate && (
              <ClearButton
                label={`Bỏ ngày ${describeDue(dueDate, today).label}`}
                onClick={() => {
                  ignoreToken('date')
                  setExplicitDue(null)
                }}
              />
            )}
          </span>
          <span className={styles.chipGroup}>
            <TimePicker
              value={{ time: dueTime, duration: dueTime ? duration : null }}
              onChange={(v) => {
                const timeTokens = parsed.tokens.filter(
                  (t) => t.type === 'time' || t.type === 'duration',
                )
                if (timeTokens.length) setText(cut(text, ...timeTokens))
                setExplicitTime(v)
                if (v.time && !dueDate) setExplicitDue(today)
              }}
            />
            {dueTime && (
              <ClearButton
                label="Bỏ giờ"
                onClick={() => {
                  ignoreToken('time')
                  ignoreToken('duration')
                  setExplicitTime({ time: null, duration: null })
                }}
              />
            )}
          </span>
          <span className={styles.chipGroup}>
            <PriorityPicker
              value={priority}
              onChange={(p) => {
                overrideToken('priority')
                setExplicitPriority(p)
              }}
            />
            {priority !== 4 && (
              <ClearButton
                label={`Bỏ ${PRIORITY_LABEL[priority]}`}
                onClick={() => {
                  ignoreToken('priority')
                  setExplicitPriority(4)
                }}
              />
            )}
          </span>
          <LabelPicker
            value={labelIds}
            onChange={(ids) => {
              const labelTokens = parsed.tokens.filter((t) => t.type === 'label')
              if (labelTokens.length) setText(cut(text, ...labelTokens))
              setExplicitLabels(ids)
            }}
          />
          {newLabels.length > 0 && (
            <span className={styles.newLabels}>
              Nhãn mới: {newLabels.map((l) => l.name).join(', ')}
            </span>
          )}
        </div>
      </div>

      <div className={styles.footer}>
        {isSubtask ? (
          <span className={styles.hint}>Công việc con thuộc cùng dự án với việc cha</span>
        ) : (
          <ProjectSelect
            value={projectId}
            onChange={(id) => {
              overrideToken('project')
              setExplicitProject(id)
            }}
          />
        )}
        <div className={styles.buttons}>
          {onClose && (
            <button type="button" className="btn btn-secondary" onClick={onClose}>
              Hủy
            </button>
          )}
          <button type="submit" className="btn btn-primary" disabled={!parsed.title || busy}>
            {busy ? 'Đang thêm…' : isSubtask ? 'Thêm việc con' : 'Thêm việc'}
          </button>
        </div>
      </div>

      {error && (
        <p id={errorId} role="alert" className={styles.error}>
          {error}
        </p>
      )}
      {showHint && (
        <p className={styles.hint}>
          Gõ tự nhiên: “mai”, “thứ 6”, “20/10”, “9h”, “3h chiều”, “trong 2 tiếng”, “p1”–“p4”,
          “#dự-án”, “@nhãn”. Nhấn × để bỏ phần đã nhận diện.
        </p>
      )}
    </form>
  )
}

function ClearButton({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className={styles.clear} aria-label={label} title={label} onClick={onClick}>
      <CloseIcon size={12} />
    </button>
  )
}

function renderHighlights(text: string, tokens: QuickAddToken[]) {
  const parts: ReactNode[] = []
  let cursor = 0
  for (const token of [...tokens].sort((a, b) => a.start - b.start)) {
    if (token.start > cursor) parts.push(text.slice(cursor, token.start))
    parts.push(
      <mark key={token.start} className={`${styles.mark} ${styles[token.type]}`}>
        {text.slice(token.start, token.end)}
      </mark>,
    )
    cursor = token.end
  }
  parts.push(text.slice(cursor))
  // Trailing space keeps the mirror width in sync with the caret.
  parts.push(' ')
  return parts
}
