import { describe, expect, it } from 'vitest'
import {
  formatDuration,
  fromMinutes,
  hhmm,
  isoWeek,
  layoutDay,
  mondayOf,
  timeRange,
  toMinutes,
} from './time'

describe('time helpers', () => {
  it('converts between "HH:MM" and minutes', () => {
    expect(toMinutes('09:30:00')).toBe(570)
    expect(fromMinutes(570)).toBe('09:30')
    expect(fromMinutes(24 * 60 + 30)).toBe('23:59') // clamped to the same day
    expect(hhmm('14:05:00')).toBe('14:05')
  })

  it('formats durations and ranges', () => {
    expect(formatDuration(45)).toBe('45 phút')
    expect(formatDuration(60)).toBe('1 giờ')
    expect(formatDuration(90)).toBe('1 giờ 30 phút')
    expect(timeRange('09:00:00', 90)).toBe('09:00 – 10:30')
    expect(timeRange('09:00:00', null)).toBe('09:00 – 10:00') // default 60 minutes
  })

  it('finds the Monday of a week', () => {
    expect(mondayOf('2026-10-16')).toBe('2026-10-12') // Friday
    expect(mondayOf('2026-10-12')).toBe('2026-10-12') // Monday
    expect(mondayOf('2026-10-18')).toBe('2026-10-12') // Sunday belongs to the same week
  })

  it.each([
    ['2026-10-16', 42],
    ['2026-01-01', 1], // Thursday
    ['2027-01-01', 53], // Friday: still the last week of 2026
    ['2024-12-30', 1], // Monday of week 1 of 2025
  ])('isoWeek(%s) = %i', (iso, week) => {
    expect(isoWeek(iso)).toBe(week)
  })
})

describe('layoutDay', () => {
  it('gives non-overlapping events the full width', () => {
    const layout = layoutDay([
      { id: 1, start: 540, end: 600 },
      { id: 2, start: 600, end: 660 }, // starts exactly when 1 ends
    ])
    expect(layout.get(1)).toEqual({ lane: 0, lanes: 1 })
    expect(layout.get(2)).toEqual({ lane: 0, lanes: 1 })
  })

  it('splits overlapping events into lanes and reuses freed lanes', () => {
    const layout = layoutDay([
      { id: 1, start: 540, end: 660 }, // 09:00-11:00
      { id: 2, start: 570, end: 600 }, // 09:30-10:00 overlaps 1
      { id: 3, start: 600, end: 630 }, // 10:00-10:30 reuses lane of 2
      { id: 4, start: 720, end: 780 }, // separate group
    ])
    expect(layout.get(1)).toEqual({ lane: 0, lanes: 2 })
    expect(layout.get(2)).toEqual({ lane: 1, lanes: 2 })
    expect(layout.get(3)).toEqual({ lane: 1, lanes: 2 })
    expect(layout.get(4)).toEqual({ lane: 0, lanes: 1 })
  })

  it('handles three-way overlaps', () => {
    const layout = layoutDay([
      { id: 1, start: 0, end: 120 },
      { id: 2, start: 30, end: 90 },
      { id: 3, start: 60, end: 100 },
    ])
    expect([...layout.values()].map((p) => p.lanes)).toEqual([3, 3, 3])
    expect(layout.get(3)?.lane).toBe(2)
  })
})
