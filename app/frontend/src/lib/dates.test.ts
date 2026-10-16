import { describe, expect, it } from 'vitest'
import {
  addDays,
  dayHeading,
  describeDue,
  diffDays,
  longDate,
  makeDate,
  nextWeekday,
  parseISODate,
  shortDate,
  toISODate,
} from './dates'

const TODAY = '2026-10-16' // Friday

describe('dates', () => {
  it('converts local dates to ISO without UTC shifts', () => {
    expect(toISODate(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05')
    expect(toISODate(parseISODate('2026-10-16')!)).toBe('2026-10-16')
  })

  it('rejects impossible dates', () => {
    expect(makeDate(2026, 2, 29)).toBeNull()
    expect(makeDate(2028, 2, 29)).not.toBeNull()
    expect(parseISODate('2026-13-01')).toBeNull()
    expect(parseISODate('16/10/2026')).toBeNull()
  })

  it('adds days across month and year boundaries', () => {
    expect(addDays('2026-10-31', 1)).toBe('2026-11-01')
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01')
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28')
  })

  it('computes day differences and next weekday', () => {
    expect(diffDays(TODAY, '2026-10-20')).toBe(4)
    expect(diffDays(TODAY, '2026-10-10')).toBe(-6)
    expect(nextWeekday(TODAY, 1)).toBe('2026-10-19')
    expect(nextWeekday(TODAY, 5)).toBe('2026-10-23') // strictly after
  })

  it.each([
    ['2026-10-14', 'overdue', '14 thg 10'],
    ['2025-12-30', 'overdue', '30 thg 12, 2025'],
    ['2026-10-16', 'today', 'Hôm nay'],
    ['2026-10-17', 'tomorrow', 'Ngày mai'],
    ['2026-10-20', 'soon', 'Thứ Ba'],
    ['2026-10-22', 'soon', 'Thứ Năm'],
    ['2026-10-23', 'later', '23 thg 10'],
    ['2027-02-01', 'later', '1 thg 2, 2027'],
  ])('describeDue(%s) -> %s "%s"', (iso, tone, label) => {
    expect(describeDue(iso, TODAY)).toEqual({ tone, label })
  })

  it('formats headings', () => {
    expect(longDate(TODAY)).toBe('Thứ Sáu, 16 tháng 10')
    expect(shortDate('2026-01-02', TODAY)).toBe('2 thg 1')
    expect(dayHeading(TODAY, TODAY)).toBe('16 thg 10 · Hôm nay · Thứ Sáu')
    expect(dayHeading('2026-10-17', TODAY)).toBe('17 thg 10 · Ngày mai · Thứ Bảy')
    expect(dayHeading('2026-10-19', TODAY)).toBe('19 thg 10 · Thứ Hai')
  })
})
