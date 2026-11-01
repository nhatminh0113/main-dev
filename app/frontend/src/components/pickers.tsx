import { useId, useState } from 'react'
import { useLabels, useProjects, useSaveLabel } from '../api/hooks'
import type { Priority } from '../api/types'
import { COLOR_HEX } from '../lib/colors'
import { addDays, describeDue, nextWeekday, weekday } from '../lib/dates'
import { fold } from '../lib/text'
import { useToday } from '../lib/useToday'
import { DEFAULT_DURATION, DURATION_OPTIONS, formatDuration, hhmm } from '../lib/time'
import { CalendarIcon, CheckIcon, ClockIcon, ColorDot, FlagIcon, PlusIcon, TagIcon } from './icons'
import { PRIORITY_LABEL, priorityColor } from '../lib/priority'
import { Popover } from './Popover'
import styles from './pickers.module.css'

// ---------- Due date ----------

interface DuePickerProps {
  value: string | null
  onChange: (value: string | null) => void
  /** Compact icon-only trigger (task row actions). */
  iconOnly?: boolean
}

export function DuePicker({ value, onChange, iconOnly = false }: DuePickerProps) {
  const today = useToday()
  const inputId = useId()
  const due = value ? describeDue(value, today) : null
  const weekend = weekday(today) === 6 ? today : nextWeekday(today, 6)
  const options: Array<[string, string | null, string]> = [
    ['Hôm nay', today, 'today'],
    ['Ngày mai', addDays(today, 1), 'tomorrow'],
    ['Cuối tuần này', weekend, 'soon'],
    ['Tuần sau', nextWeekday(today, 1), 'soon'],
    ['Không có ngày', null, 'later'],
  ]

  return (
    <Popover
      label="Chọn ngày hết hạn"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={iconOnly ? 'icon-btn' : `${styles.chip} ${due ? styles[due.tone] : ''}`}
          aria-label={iconOnly ? 'Lên lịch' : `Ngày hết hạn: ${due ? due.label : 'chưa có'}`}
          title={iconOnly ? 'Lên lịch' : undefined}
        >
          <CalendarIcon size={16} />
          {!iconOnly && <span>{due ? due.label : 'Ngày'}</span>}
        </button>
      )}
    >
      {(close) => (
        <div className={styles.menu}>
          {options.map(([label, date, tone]) => (
            <button
              key={label}
              type="button"
              className={styles.option}
              aria-pressed={value === date}
              onClick={() => {
                onChange(date)
                close()
              }}
            >
              <span className={`${styles.optionIcon} ${styles[tone]}`}>
                <CalendarIcon size={16} />
              </span>
              <span className={styles.optionLabel}>{label}</span>
              {date && describeDue(date, today).label !== label && (
                <span className={styles.optionHint}>{describeDue(date, today).label}</span>
              )}
            </button>
          ))}
          <div className={styles.dateField}>
            <label htmlFor={inputId}>Chọn ngày khác</label>
            <input
              id={inputId}
              type="date"
              className="input"
              value={value ?? ''}
              onChange={(e) => {
                if (e.target.value) {
                  onChange(e.target.value)
                  close()
                }
              }}
            />
          </div>
        </div>
      )}
    </Popover>
  )
}

// ---------- Time & duration ----------

export interface TimeValue {
  /** "HH:MM" or null */
  time: string | null
  duration: number | null
}

export function TimePicker({ value, onChange }: { value: TimeValue; onChange: (v: TimeValue) => void }) {
  const timeId = useId()
  const durationId = useId()
  const label = value.time
    ? `${hhmm(value.time)} · ${formatDuration(value.duration ?? DEFAULT_DURATION)}`
    : null

  return (
    <Popover
      label="Chọn giờ"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={`${styles.chip} ${value.time ? styles.soon : ''}`}
          aria-label={`Giờ: ${label ?? 'chưa có'}`}
        >
          <ClockIcon size={16} />
          <span>{label ?? 'Giờ'}</span>
        </button>
      )}
    >
      {(close) => (
        <div className={styles.menu}>
          <div className={styles.timeFields}>
            <label htmlFor={timeId}>Giờ bắt đầu</label>
            <input
              id={timeId}
              type="time"
              className="input"
              step={300}
              value={value.time ? hhmm(value.time) : ''}
              onChange={(e) =>
                onChange({ time: e.target.value || null, duration: e.target.value ? value.duration : null })
              }
            />
            <label htmlFor={durationId}>Thời lượng</label>
            <select
              id={durationId}
              className="input"
              value={value.duration ?? DEFAULT_DURATION}
              disabled={!value.time}
              onChange={(e) => onChange({ ...value, duration: Number(e.target.value) })}
            >
              {DURATION_OPTIONS.map((m) => (
                <option key={m} value={m}>
                  {formatDuration(m)}
                </option>
              ))}
            </select>
          </div>
          <div className={styles.menuFooter}>
            {value.time && (
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => {
                  onChange({ time: null, duration: null })
                  close()
                }}
              >
                Bỏ giờ
              </button>
            )}
            <button type="button" className="btn btn-primary" onClick={close}>
              Xong
            </button>
          </div>
        </div>
      )}
    </Popover>
  )
}

// ---------- Priority ----------

export function PriorityPicker({
  value,
  onChange,
}: {
  value: Priority
  onChange: (value: Priority) => void
}) {
  return (
    <Popover
      label="Chọn mức ưu tiên"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={styles.chip}
          aria-label={`Mức ưu tiên: ${PRIORITY_LABEL[value]}`}
        >
          <FlagIcon size={16} style={{ color: priorityColor(value) }} />
          <span>{value === 4 ? 'Ưu tiên' : `P${value}`}</span>
        </button>
      )}
    >
      {(close) => (
        <div className={styles.menu}>
          {([1, 2, 3, 4] as const).map((p) => (
            <button
              key={p}
              type="button"
              className={styles.option}
              aria-pressed={value === p}
              onClick={() => {
                onChange(p)
                close()
              }}
            >
              <FlagIcon size={16} style={{ color: priorityColor(p) }} />
              <span className={styles.optionLabel}>{PRIORITY_LABEL[p]}</span>
              {value === p && <CheckIcon size={16} className={styles.check} />}
            </button>
          ))}
        </div>
      )}
    </Popover>
  )
}

// ---------- Labels ----------

export function LabelPicker({
  value,
  onChange,
}: {
  value: number[]
  onChange: (value: number[]) => void
}) {
  const { data: labels = [] } = useLabels()
  const saveLabel = useSaveLabel()
  const [filter, setFilter] = useState('')
  const filterId = useId()
  const selected = labels.filter((l) => value.includes(l.id))
  const shown = labels.filter((l) => fold(l.name).includes(fold(filter.trim())))
  const canCreate =
    /^[^\s@#]+$/.test(filter.trim()) &&
    !labels.some((l) => l.name.toLocaleLowerCase() === filter.trim().toLocaleLowerCase())

  const toggle = (id: number) =>
    onChange(value.includes(id) ? value.filter((v) => v !== id) : [...value, id])

  return (
    <Popover
      label="Chọn nhãn"
      trigger={(props) => (
        <button
          type="button"
          {...props}
          className={styles.chip}
          aria-label={`Nhãn: ${selected.length ? selected.map((l) => l.name).join(', ') : 'chưa có'}`}
        >
          <TagIcon size={16} />
          <span>{selected.length ? selected.map((l) => l.name).join(', ') : 'Nhãn'}</span>
        </button>
      )}
    >
      {() => (
        <div className={styles.menu}>
          <label htmlFor={filterId} className="visually-hidden">
            Lọc hoặc tạo nhãn
          </label>
          <input
            id={filterId}
            className="input"
            placeholder="Gõ tên nhãn…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
          />
          <ul className={styles.checkList}>
            {shown.map((label) => (
              <li key={label.id}>
                <label className={styles.checkRow}>
                  <input
                    type="checkbox"
                    checked={value.includes(label.id)}
                    onChange={() => toggle(label.id)}
                  />
                  <ColorDot color={COLOR_HEX[label.color]} />
                  <span>{label.name}</span>
                </label>
              </li>
            ))}
          </ul>
          {canCreate && (
            <button
              type="button"
              className={styles.option}
              disabled={saveLabel.isPending}
              onClick={async () => {
                const created = await saveLabel.mutateAsync({ name: filter.trim(), color: 'grey' })
                onChange([...value, created.id])
                setFilter('')
              }}
            >
              <PlusIcon size={16} />
              <span className={styles.optionLabel}>Tạo nhãn “{filter.trim()}”</span>
            </button>
          )}
          {!shown.length && !canCreate && <p className={styles.empty}>Chưa có nhãn nào.</p>}
        </div>
      )}
    </Popover>
  )
}

// ---------- Project ----------

export function ProjectSelect({
  value,
  onChange,
  id,
  disabled,
}: {
  value: number | undefined
  onChange: (value: number) => void
  id?: string
  disabled?: boolean
}) {
  const { data: projects = [] } = useProjects()
  const current = projects.find((p) => p.id === value)
  return (
    <span className={styles.selectWrap}>
      {current && <ColorDot color={COLOR_HEX[current.color]} />}
      <select
        id={id}
        className={styles.select}
        value={value ?? ''}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        aria-label={id ? undefined : 'Dự án'}
      >
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
    </span>
  )
}
