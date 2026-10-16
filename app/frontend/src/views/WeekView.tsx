import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { useSearchParams } from 'react-router'
import { useProjects, useTasks } from '../api/hooks'
import type { Task } from '../api/types'
import { ChevronLeftIcon, ChevronRightIcon, PlusIcon } from '../components/icons'
import { useTaskActions } from '../components/useTaskActions'
import { useUI } from '../layout/ui'
import { COLOR_HEX } from '../lib/colors'
import { addDays, parseISODate, WEEKDAYS } from '../lib/dates'
import { PRIORITY_LABEL } from '../lib/priority'
import { DEFAULT_DURATION, isoWeek, layoutDay, mondayOf, timeRange, toMinutes } from '../lib/time'
import { useMediaQuery } from '../lib/useMediaQuery'
import { useToday } from '../lib/useToday'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'
import styles from './WeekView.module.css'

/** Height of one hour row, in px (must match --hour in WeekView.module.css). */
const HOUR_PX = 48
const FIRST_VISIBLE_HOUR = 7
const MIN_BLOCK_MINUTES = 30
/** How much wider than its lane an overlapping event is drawn. */
const OVERLAP_WIDEN = 1.7
const HOURS = Array.from({ length: 24 }, (_, h) => h)
const SHORT_DAY = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']

const dayIndex = (iso: string) => parseISODate(iso)!.getDay()
const dm = (iso: string) => `${Number(iso.slice(8))}/${Number(iso.slice(5, 7))}`

export function WeekView() {
  const today = useToday()
  const [params, setParams] = useSearchParams()
  const requested = params.get('start')
  const start = mondayOf(requested && parseISODate(requested) ? requested : today)
  const end = addDays(start, 6)
  const days = Array.from({ length: 7 }, (_, i) => addDays(start, i))
  const isThisWeek = days.includes(today)

  // Mobile shows one day at a time.
  const narrow = useMediaQuery('(max-width: 767px)')
  const [picked, setPicked] = useState<string | null>(null)
  const selectedDay = picked && days.includes(picked) ? picked : isThisWeek ? today : start
  const visibleDays = narrow ? [selectedDay] : days

  const query = useTasks({ due_from: start, due_to: end, limit: 500 })
  const tasks = query.data ?? []
  const openCount = tasks.filter((t) => !t.done).length

  const goTo = (monday: string | null) => {
    setPicked(null)
    setParams(monday && monday !== mondayOf(today) ? { start: monday } : {})
  }

  const sm = Number(start.slice(5, 7))
  const em = Number(end.slice(5, 7))
  // "12 – 18 tháng 10, 2026" or, across months, "28/9 – 4/10, 2026"
  const range =
    sm === em
      ? `${Number(start.slice(8))} – ${Number(end.slice(8))} tháng ${em}, ${end.slice(0, 4)}`
      : `${dm(start)} – ${dm(end)}, ${end.slice(0, 4)}`

  return (
    <>
      <ViewHeader
        title="Lịch tuần"
        subtitle={`Tuần ${isoWeek(start)} · ${range} · ${openCount} việc chưa xong`}
        actions={
          <div className={styles.nav}>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={isThisWeek}
              onClick={() => goTo(null)}
            >
              Tuần này
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Tuần trước"
              title="Tuần trước"
              onClick={() => goTo(addDays(start, -7))}
            >
              <ChevronLeftIcon />
            </button>
            <button
              type="button"
              className="icon-btn"
              aria-label="Tuần sau"
              title="Tuần sau"
              onClick={() => goTo(addDays(start, 7))}
            >
              <ChevronRightIcon />
            </button>
          </div>
        }
      />

      {narrow && (
        <div className={styles.dayPicker} role="group" aria-label="Chọn ngày">
          {days.map((day) => (
            <button
              key={day}
              type="button"
              className={styles.dayPill}
              aria-pressed={day === selectedDay}
              aria-label={`${WEEKDAYS[dayIndex(day)]} ${dm(day)}`}
              onClick={() => setPicked(day)}
            >
              <span>{SHORT_DAY[dayIndex(day)]}</span>
              <strong className={day === today ? styles.todayNum : undefined}>
                {Number(day.slice(8))}
              </strong>
            </button>
          ))}
        </div>
      )}

      <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
        <WeekGrid days={visibleDays} today={today} tasks={tasks} />
      </QueryState>
    </>
  )
}

function WeekGrid({ days, today, tasks }: { days: string[]; today: string; tasks: Task[] }) {
  const { openQuickAdd } = useUI()
  const scrollRef = useRef<HTMLDivElement>(null)
  const columns = { '--days': days.length } as CSSProperties

  // Scroll to the morning (or the earliest event) once, when the grid first appears.
  const earliest = Math.min(
    FIRST_VISIBLE_HOUR,
    ...tasks.filter((t) => t.due_time).map((t) => Math.floor(toMinutes(t.due_time!) / 60)),
  )
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current || !scrollRef.current) return
    // A little headroom so the first hour label is not hidden under the all-day row.
    scrollRef.current.scrollTop = Math.max(0, earliest * HOUR_PX - 12)
    scrolled.current = true
  }, [earliest])

  return (
    <div className={styles.calendar} style={columns}>
      {/* Header: day names */}
      <div className={styles.headRow}>
        <div className={styles.gutter} />
        {days.map((day) => {
          const isToday = day === today
          return (
            <div key={day} className={`${styles.dayHead} ${isToday ? styles.isToday : ''}`}>
              <span className={styles.dayName}>
                {SHORT_DAY[dayIndex(day)]}
                {isToday && <span className={styles.todayTag}> · Hôm nay</span>}
              </span>
              <span className={styles.dayNum} aria-hidden="true">
                {Number(day.slice(8))}
              </span>
              <span className="visually-hidden">
                {WEEKDAYS[dayIndex(day)]} {dm(day)}
              </span>
              <button
                type="button"
                className={`icon-btn ${styles.addDay}`}
                aria-label={`Thêm việc vào ${WEEKDAYS[dayIndex(day)]} ${dm(day)}`}
                title="Thêm việc"
                onClick={() => openQuickAdd({ dueDate: day })}
              >
                <PlusIcon size={16} />
              </button>
            </div>
          )
        })}
      </div>

      {/* All-day row: tasks with a date but no time */}
      <div className={styles.allDayRow}>
        <div className={`${styles.gutter} ${styles.allDayLabel}`}>Cả ngày</div>
        {days.map((day) => (
          <ul
            key={day}
            className={`${styles.allDayCell} ${day === today ? styles.isToday : ''}`}
            aria-label={`Cả ngày, ${WEEKDAYS[dayIndex(day)]} ${dm(day)}`}
          >
            {tasks
              .filter((t) => t.due_date === day && !t.due_time)
              .map((t) => (
                <li key={t.id}>
                  <EventChip task={t} day={day} />
                </li>
              ))}
          </ul>
        ))}
      </div>

      {/* Hour grid */}
      <div className={styles.body} ref={scrollRef}>
        <div className={styles.grid}>
          <div className={styles.hours} aria-hidden="true">
            {HOURS.map((h) => (
              <div key={h} className={styles.hourLabel}>
                {h === 0 ? '' : `${String(h).padStart(2, '0')}:00`}
              </div>
            ))}
          </div>
          {days.map((day) => (
            <DayColumn
              key={day}
              day={day}
              isToday={day === today}
              tasks={tasks.filter((t) => t.due_date === day && t.due_time)}
              onSlot={(hour) =>
                openQuickAdd({
                  dueDate: day,
                  dueTime: `${String(hour).padStart(2, '0')}:00`,
                  duration: DEFAULT_DURATION,
                })
              }
            />
          ))}
        </div>
      </div>
    </div>
  )
}

function DayColumn({
  day,
  isToday,
  tasks,
  onSlot,
}: {
  day: string
  isToday: boolean
  tasks: Task[]
  onSlot: (hour: number) => void
}) {
  const intervals = tasks.map((t) => {
    const s = toMinutes(t.due_time!)
    return {
      id: t.id,
      start: s,
      end: Math.min(24 * 60, s + Math.max(MIN_BLOCK_MINUTES, t.duration_minutes ?? DEFAULT_DURATION)),
    }
  })
  const layout = layoutDay(intervals)

  return (
    <ul
      className={`${styles.dayCol} ${isToday ? styles.isToday : ''}`}
      aria-label={`Lịch giờ, ${WEEKDAYS[dayIndex(day)]} ${dm(day)}`}
    >
      {/* Empty hour slots: a mouse shortcut. Keyboard users use the "+" button in the day header. */}
      {HOURS.map((h) => (
        <li key={h} className={styles.slot} aria-hidden="true">
          <button type="button" tabIndex={-1} className={styles.slotBtn} onClick={() => onSlot(h)}>
            + {String(h).padStart(2, '0')}:00
          </button>
        </li>
      ))}
      {tasks.map((task) => {
        const interval = intervals.find((i) => i.id === task.id)!
        const place = layout.get(task.id) ?? { lane: 0, lanes: 1 }
        // Overlapping events cascade (like Google Calendar): each one starts at its lane but
        // is wider than its share, so titles stay readable; later lanes are drawn on top.
        const share = 100 / place.lanes
        const left = place.lane * share
        const isLast = place.lane === place.lanes - 1
        const width = isLast ? share : Math.min(share * OVERLAP_WIDEN, 100 - left)
        const style = {
          top: (interval.start / 60) * HOUR_PX,
          height: ((interval.end - interval.start) / 60) * HOUR_PX - 2,
          left: `calc(${left}% + 2px)`,
          width: `calc(${width}% - 4px)`,
          zIndex: 1 + place.lane,
        }
        return (
          <li key={task.id} className={styles.eventSlot} style={style}>
            <EventBlock task={task} day={day} />
          </li>
        )
      })}
      {isToday && <NowLine />}
    </ul>
  )
}

/** Shared parts of a block / chip: colour from the project, circle from the priority. */
function useEventProps(task: Task, day: string) {
  const { openTask } = useUI()
  const { toggle } = useTaskActions()
  const { data: projects = [] } = useProjects()
  const project = projects.find((p) => p.id === task.project_id)
  const color = project ? COLOR_HEX[project.color] : COLOR_HEX.grey
  const when = task.due_time
    ? `${WEEKDAYS[dayIndex(day)]} ${timeRange(task.due_time, task.duration_minutes)}`
    : `${WEEKDAYS[dayIndex(day)]}, cả ngày`
  const name = [task.title, when, project?.name, task.done ? 'đã xong' : null]
    .filter(Boolean)
    .join(', ')
  return { openTask, toggle, project, color, name }
}

function CheckCircle({ task, onToggle }: { task: Task; onToggle: () => void }) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={task.done}
      aria-label={`${task.done ? 'Bỏ hoàn thành' : 'Hoàn thành'} “${task.title}”`}
      title={PRIORITY_LABEL[task.priority]}
      className={styles.check}
      data-priority={task.priority}
      onClick={onToggle}
    />
  )
}

function EventBlock({ task, day }: { task: Task; day: string }) {
  const { openTask, toggle, project, color, name } = useEventProps(task, day)
  return (
    <div
      className={`${styles.event} ${task.done ? styles.done : ''}`}
      style={{ '--event': color } as CSSProperties}
    >
      <CheckCircle task={task} onToggle={() => toggle(task)} />
      <button type="button" className={styles.eventMain} aria-label={name} onClick={() => openTask(task.id)}>
        <span className={styles.eventTitle}>{task.title}</span>
        <span className={styles.eventMeta}>
          {timeRange(task.due_time!, task.duration_minutes)}
          {task.subtask_count > 0 && ` · ${task.subtask_done_count}/${task.subtask_count}`}
        </span>
        {project && <span className={styles.eventMeta}>{project.name}</span>}
      </button>
    </div>
  )
}

function EventChip({ task, day }: { task: Task; day: string }) {
  const { openTask, toggle, color, name } = useEventProps(task, day)
  return (
    <div
      className={`${styles.chip} ${task.done ? styles.done : ''}`}
      style={{ '--event': color } as CSSProperties}
    >
      <CheckCircle task={task} onToggle={() => toggle(task)} />
      <button type="button" className={styles.chipMain} aria-label={name} onClick={() => openTask(task.id)}>
        {task.title}
      </button>
    </div>
  )
}

/** Red line at the current time, updated every minute. */
function NowLine() {
  const [minutes, setMinutes] = useState(() => {
    const d = new Date()
    return d.getHours() * 60 + d.getMinutes()
  })
  useEffect(() => {
    const timer = setInterval(() => {
      const d = new Date()
      setMinutes(d.getHours() * 60 + d.getMinutes())
    }, 60_000)
    return () => clearInterval(timer)
  }, [])
  return <li className={styles.now} style={{ top: (minutes / 60) * HOUR_PX }} aria-hidden="true" />
}
