/**
 * Time-of-day helpers. Times are local wall-clock strings: the API returns "HH:MM:SS",
 * the UI uses "HH:MM". Internally we work in minutes since midnight.
 */
import { addDays, diffDays, weekday } from './dates'

export const DEFAULT_DURATION = 60
export const DURATION_OPTIONS = [15, 30, 45, 60, 90, 120, 180, 240, 360, 480]

const pad = (n: number) => String(n).padStart(2, '0')

/** "09:30:00" | "09:30" -> "09:30" */
export function hhmm(time: string): string {
  return time.slice(0, 5)
}

export function toMinutes(time: string): number {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + m
}

export function fromMinutes(minutes: number): string {
  const clamped = Math.max(0, Math.min(24 * 60 - 1, minutes))
  return `${pad(Math.floor(clamped / 60))}:${pad(clamped % 60)}`
}

/** "1 giờ 30 phút", "45 phút", "2 giờ" */
export function formatDuration(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  if (!h) return `${m} phút`
  return m ? `${h} giờ ${m} phút` : `${h} giờ`
}

/** "09:00 – 10:30" */
export function timeRange(start: string, duration: number | null): string {
  const from = toMinutes(start)
  return `${hhmm(start)} – ${fromMinutes(from + (duration ?? DEFAULT_DURATION))}`
}

/** Monday of the week containing `iso` (weeks start on Monday in Vietnam). */
export function mondayOf(iso: string): string {
  return addDays(iso, -((weekday(iso) + 6) % 7))
}

/** Thursday of the (Monday-based) week containing `iso`. */
const thursdayOf = (iso: string) => addDays(mondayOf(iso), 3)

/** ISO-8601 week number: week 1 is the week containing 4 January. */
export function isoWeek(iso: string): number {
  const thursday = thursdayOf(iso)
  const week1Thursday = thursdayOf(`${thursday.slice(0, 4)}-01-04`)
  return diffDays(week1Thursday, thursday) / 7 + 1
}

export interface Interval {
  id: number
  start: number
  end: number
}

export interface Placement {
  /** 0-based column inside its overlap group */
  lane: number
  /** number of columns in its overlap group */
  lanes: number
}

/**
 * Side-by-side layout for overlapping events in one day (like a calendar app):
 * events that overlap share the width; each gets the first free lane.
 */
export function layoutDay(items: Interval[]): Map<number, Placement> {
  const sorted = [...items].sort((a, b) => a.start - b.start || b.end - a.end)
  const result = new Map<number, Placement>()
  let group: Array<Interval & { lane: number }> = []
  let laneEnds: number[] = []
  let groupEnd = -1

  const flush = () => {
    for (const item of group) result.set(item.id, { lane: item.lane, lanes: laneEnds.length })
    group = []
    laneEnds = []
  }

  for (const item of sorted) {
    if (item.start >= groupEnd) flush()
    let lane = laneEnds.findIndex((end) => end <= item.start)
    if (lane === -1) {
      lane = laneEnds.length
      laneEnds.push(item.end)
    } else {
      laneEnds[lane] = item.end
    }
    group.push({ ...item, lane })
    groupEnd = Math.max(groupEnd, item.end)
  }
  flush()
  return result
}
