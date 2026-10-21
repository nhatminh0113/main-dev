/**
 * Date helpers working on local calendar dates as ISO strings (`YYYY-MM-DD`).
 * Due dates have no time, so we never convert through UTC (that would shift days).
 */

export const WEEKDAYS = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy']

const pad = (n: number) => String(n).padStart(2, '0')

export function toISODate(date: Date): string {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
}

/** Parse `YYYY-MM-DD` into a local Date at midnight. Returns null for invalid dates. */
export function parseISODate(iso: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!match) return null
  const [y, m, d] = match.slice(1).map(Number)
  return makeDate(y, m, d)
}

/** Build a local date, or null if the day does not exist (e.g. 31/02). */
export function makeDate(year: number, month: number, day: number): Date | null {
  const date = new Date(year, month - 1, day)
  const valid =
    date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day
  return valid ? date : null
}

export function todayISO(now: Date = new Date()): string {
  return toISODate(now)
}

export function addDays(iso: string, days: number): string {
  const date = parseISODate(iso)!
  date.setDate(date.getDate() + days)
  return toISODate(date)
}

export function weekday(iso: string): number {
  return parseISODate(iso)!.getDay()
}

/** Whole days from `from` to `to` (negative if `to` is earlier). */
export function diffDays(from: string, to: string): number {
  const a = parseISODate(from)!
  const b = parseISODate(to)!
  return Math.round((b.getTime() - a.getTime()) / 86_400_000)
}

/** Next date (strictly after `from`) that falls on `day` (0 = Sunday). */
export function nextWeekday(from: string, day: number): string {
  const delta = (day - weekday(from) + 7) % 7 || 7
  return addDays(from, delta)
}

/** "16 thg 10", plus the year when it differs from `today`'s year. */
export function shortDate(iso: string, today: string): string {
  const [y, m, d] = iso.split('-').map(Number)
  const sameYear = today.startsWith(String(y))
  return sameYear ? `${d} thg ${m}` : `${d} thg ${m}, ${y}`
}

/** "Thứ Sáu, 16 tháng 10" */
export function longDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${WEEKDAYS[weekday(iso)]}, ${d} tháng ${m}`
}

export type DueTone = 'overdue' | 'today' | 'tomorrow' | 'soon' | 'later'

export interface DueInfo {
  label: string
  tone: DueTone
}

/** Human label and colour tone for a due date, Todoist style. */
export function describeDue(iso: string, today: string): DueInfo {
  const days = diffDays(today, iso)
  if (days < 0) return { label: shortDate(iso, today), tone: 'overdue' }
  if (days === 0) return { label: 'Hôm nay', tone: 'today' }
  if (days === 1) return { label: 'Ngày mai', tone: 'tomorrow' }
  if (days < 7) return { label: WEEKDAYS[weekday(iso)], tone: 'soon' }
  return { label: shortDate(iso, today), tone: 'later' }
}

/** Section heading in Upcoming: "17 thg 10 · Ngày mai · Thứ Bảy". */
export function dayHeading(iso: string, today: string): string {
  const parts = [shortDate(iso, today)]
  const days = diffDays(today, iso)
  if (days === 0) parts.push('Hôm nay')
  if (days === 1) parts.push('Ngày mai')
  parts.push(WEEKDAYS[weekday(iso)])
  return parts.join(' · ')
}
