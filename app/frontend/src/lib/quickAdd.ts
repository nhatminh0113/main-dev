/**
 * Natural-language quick add, Todoist style (Vietnamese + English).
 *
 *   "Nộp báo cáo ngày mai p1 #DoAnDevOps @khẩn"
 *   -> title "Nộp báo cáo", due tomorrow, priority 1, project "Đồ án DevOps", label "khẩn"
 *
 * Only whole words are matched. Every recognised part is returned as a token with its
 * position so the UI can highlight it and let the user dismiss it (`ignore`).
 */
import type { Priority } from '../api/types'
import { addDays, makeDate, nextWeekday, parseISODate, toISODate, weekday } from './dates'
import { nameKey } from './text'

export type TokenType = 'date' | 'priority' | 'project' | 'label'

export interface QuickAddToken {
  type: TokenType
  start: number
  end: number
  text: string
  /** Stable identity used to dismiss a token: `${type}:${lowercased text}`. */
  key: string
}

export interface ParsedLabel {
  name: string
  /** null = label does not exist yet and should be created. */
  id: number | null
}

export interface ParsedQuickAdd {
  title: string
  dueDate: string | null
  priority: Priority | null
  projectId: number | null
  labels: ParsedLabel[]
  tokens: QuickAddToken[]
}

export interface ParseContext {
  today: string
  projects: ReadonlyArray<{ id: number; name: string }>
  labels: ReadonlyArray<{ id: number; name: string }>
  ignore?: ReadonlySet<string>
}

type DateResolver = (today: string) => string

/** Same weekday counts as today ("thứ 6" typed on a Friday means today). */
const onOrAfter = (day: number): DateResolver => (today) =>
  weekday(today) === day ? today : nextWeekday(today, day)

const WEEKDAY_WORDS: Array<[number, string[]]> = [
  [1, ['thứ 2', 'thu 2', 'thứ hai', 'thu hai', 'monday']],
  [2, ['thứ 3', 'thu 3', 'thứ ba', 'thu ba', 'tuesday']],
  [3, ['thứ 4', 'thu 4', 'thứ tư', 'thu tu', 'wednesday']],
  [4, ['thứ 5', 'thu 5', 'thứ năm', 'thu nam', 'thursday']],
  [5, ['thứ 6', 'thu 6', 'thứ sáu', 'thu sau', 'friday']],
  [6, ['thứ 7', 'thu 7', 'thứ bảy', 'thu bay', 'saturday']],
  [0, ['chủ nhật', 'chu nhat', 'sunday']],
]

const DATE_PHRASES = new Map<string, DateResolver>([
  ...['hôm nay', 'hom nay', 'today'].map((w): [string, DateResolver] => [w, (t) => t]),
  ...['ngày mai', 'ngay mai', 'mai', 'tomorrow', 'tmr'].map((w): [string, DateResolver] => [
    w,
    (t) => addDays(t, 1),
  ]),
  ...['ngày kia', 'ngay kia', 'mốt', 'ngày mốt'].map((w): [string, DateResolver] => [
    w,
    (t) => addDays(t, 2),
  ]),
  ...['cuối tuần', 'cuoi tuan', 'weekend'].map((w): [string, DateResolver] => [w, onOrAfter(6)]),
  ...['tuần sau', 'tuan sau', 'tuần tới', 'tuan toi', 'next week'].map(
    (w): [string, DateResolver] => [w, (t) => nextWeekday(t, 1)],
  ),
  ...WEEKDAY_WORDS.flatMap(([day, words]) =>
    words.map((w): [string, DateResolver] => [w, onOrAfter(day)]),
  ),
])

const MAX_PHRASE_WORDS = 2

/** dd/mm, dd/mm/yyyy (day first, Vietnamese order) or ISO yyyy-mm-dd. */
function parseNumericDate(word: string, today: string): string | null {
  const iso = /^\d{4}-\d{2}-\d{2}$/.test(word) ? parseISODate(word) : null
  if (iso) return toISODate(iso)

  const match = /^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/.exec(word)
  if (!match) return null
  const [day, month] = [Number(match[1]), Number(match[2])]
  if (match[3]) {
    const date = makeDate(Number(match[3]), month, day)
    return date ? toISODate(date) : null
  }
  // No year: this year, or next year if that date has already passed.
  const year = Number(today.slice(0, 4))
  const thisYear = makeDate(year, month, day)
  if (!thisYear) return null
  const candidate = toISODate(thisYear)
  if (candidate >= today) return candidate
  const nextYear = makeDate(year + 1, month, day)
  return nextYear ? toISODate(nextYear) : null
}

const lower = (s: string) => s.normalize('NFC').toLocaleLowerCase('vi')

export function parseQuickAdd(input: string, ctx: ParseContext): ParsedQuickAdd {
  const words = [...input.matchAll(/\S+/g)].map((m) => ({
    text: m[0],
    start: m.index,
    end: m.index + m[0].length,
  }))
  const consumed = new Array<boolean>(words.length).fill(false)
  const tokens: QuickAddToken[] = []
  const ignore = ctx.ignore ?? new Set<string>()

  const result: ParsedQuickAdd = {
    title: '',
    dueDate: null,
    priority: null,
    projectId: null,
    labels: [],
    tokens,
  }

  /** Register a token over words[i..j) unless the user dismissed it. */
  const take = (type: TokenType, i: number, j: number): boolean => {
    const text = input.slice(words[i].start, words[j - 1].end)
    const key = `${type}:${lower(text)}`
    if (ignore.has(key)) return false
    tokens.push({ type, start: words[i].start, end: words[j - 1].end, text, key })
    consumed.fill(true, i, j)
    return true
  }

  for (let i = 0; i < words.length; i++) {
    if (consumed[i]) continue
    const word = words[i].text

    if (result.dueDate === null) {
      let matched = false
      for (let n = Math.min(MAX_PHRASE_WORDS, words.length - i); n >= 1 && !matched; n--) {
        const phrase = lower(
          words
            .slice(i, i + n)
            .map((w) => w.text)
            .join(' '),
        )
        const resolve = DATE_PHRASES.get(phrase)
        const due = resolve ? resolve(ctx.today) : n === 1 ? parseNumericDate(word, ctx.today) : null
        if (due && take('date', i, i + n)) {
          result.dueDate = due
          matched = true
        }
      }
      if (matched) continue
    }

    const priority = /^p([1-4])$/i.exec(word)
    if (priority && result.priority === null) {
      if (take('priority', i, i + 1)) result.priority = Number(priority[1]) as Priority
      continue
    }

    const project = /^#(.+)$/.exec(word)
    if (project && result.projectId === null) {
      const key = nameKey(project[1])
      const found = ctx.projects.find((p) => nameKey(p.name) === key)
      if (found && take('project', i, i + 1)) result.projectId = found.id
      continue
    }

    const label = /^@([^\s@#]+)$/.exec(word)
    if (label) {
      const name = label[1]
      const existing = ctx.labels.find((l) => lower(l.name) === lower(name))
      const resolved: ParsedLabel = existing
        ? { name: existing.name, id: existing.id }
        : { name, id: null }
      const duplicate = result.labels.some((l) => lower(l.name) === lower(resolved.name))
      if (take('label', i, i + 1) && !duplicate) result.labels.push(resolved)
    }
  }

  result.title = words
    .filter((_, i) => !consumed[i])
    .map((w) => w.text)
    .join(' ')
  return result
}
