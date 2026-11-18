import { describe, expect, it } from 'vitest'
import { parseQuickAdd, type ParseContext } from './quickAdd'

// Friday 16 October 2026
const ctx: ParseContext = {
  today: '2026-10-16',
  projects: [
    { id: 1, name: 'Ghi nhanh' },
    { id: 2, name: 'Đồ án DevOps' },
    { id: 3, name: 'Cá nhân' },
  ],
  labels: [
    { id: 10, name: 'khẩn' },
    { id: 11, name: 'Work' },
  ],
}

const parse = (input: string, extra: Partial<ParseContext> = {}) =>
  parseQuickAdd(input, { ...ctx, ...extra })

describe('parseQuickAdd: dates', () => {
  it.each([
    // [input, expected due date, expected title]
    ['Nộp báo cáo hôm nay', '2026-10-16', 'Nộp báo cáo'],
    ['Nộp báo cáo hom nay', '2026-10-16', 'Nộp báo cáo'],
    ['Submit report today', '2026-10-16', 'Submit report'],
    ['Họp nhóm mai', '2026-10-17', 'Họp nhóm'],
    ['Họp nhóm ngày mai', '2026-10-17', 'Họp nhóm'],
    ['Họp nhóm ngay mai', '2026-10-17', 'Họp nhóm'],
    ['Call mom tomorrow', '2026-10-17', 'Call mom'],
    ['Call mom tmr', '2026-10-17', 'Call mom'],
    ['Đi chợ ngày kia', '2026-10-18', 'Đi chợ'],
    ['Đi chợ mốt', '2026-10-18', 'Đi chợ'],
    ['Dọn nhà thứ 2', '2026-10-19', 'Dọn nhà'],
    ['Dọn nhà thứ hai', '2026-10-19', 'Dọn nhà'],
    ['Dọn nhà thu 2', '2026-10-19', 'Dọn nhà'],
    ['Học bài thứ 4', '2026-10-21', 'Học bài'],
    ['Học bài thứ tư', '2026-10-21', 'Học bài'],
    ['Nộp bài thứ 6', '2026-10-16', 'Nộp bài'], // today is Friday: same day
    ['Nộp bài thứ sáu', '2026-10-16', 'Nộp bài'],
    ['Đá bóng thứ 7', '2026-10-17', 'Đá bóng'],
    ['Đá bóng thứ bảy', '2026-10-17', 'Đá bóng'],
    ['Về quê chủ nhật', '2026-10-18', 'Về quê'],
    ['Về quê chu nhat', '2026-10-18', 'Về quê'],
    ['Review PR monday', '2026-10-19', 'Review PR'],
    ['Review PR Friday', '2026-10-16', 'Review PR'],
    ['Dọn tủ cuối tuần', '2026-10-17', 'Dọn tủ'],
    ['Clean desk weekend', '2026-10-17', 'Clean desk'],
    ['Lập kế hoạch tuần sau', '2026-10-19', 'Lập kế hoạch'],
    ['Plan sprint next week', '2026-10-19', 'Plan sprint'],
    ['Sinh nhật 20/10', '2026-10-20', 'Sinh nhật'],
    ['Đóng tiền nhà 1/11', '2026-11-01', 'Đóng tiền nhà'],
    ['Tết 1/1', '2027-01-01', 'Tết'], // already passed this year -> next year
    ['Bảo vệ đồ án 15/12/2026', '2026-12-15', 'Bảo vệ đồ án'],
    ['Gia hạn 2027-03-05', '2027-03-05', 'Gia hạn'],
    ['Hôm nay học Docker', '2026-10-16', 'học Docker'], // date at the start
    ['HÔM NAY deploy', '2026-10-16', 'deploy'], // case-insensitive
  ])('%s', (input, due, title) => {
    const result = parse(input)
    expect(result.dueDate).toBe(due)
    expect(result.title).toBe(title)
  })

  it.each([
    '31/2 không tồn tại', // invalid calendar date
    'Mua mãi không hết', // "mãi" (forever) is not "mai" (tomorrow)
    'Một việc nhỏ',
    'maika', // whole words only
    'Thu hoạch rau', // "thu" alone is not a weekday
    'Phiên bản 1.2/3',
  ])('finds no date in "%s"', (input) => {
    const result = parse(input)
    expect(result.dueDate).toBeNull()
    expect(result.title).toBe(input)
  })

  it('treats a fraction-like "3/4" as a date (known ambiguity, removable via ×)', () => {
    const result = parse('Đọc 3/4 cuốn sách')

    expect(result.dueDate).toBe('2027-04-03')
    expect(result.title).toBe('Đọc cuốn sách')
  })

  it('uses only the first date and keeps later ones in the title', () => {
    const result = parse('Gọi điện mai hoặc thứ 2')

    expect(result.dueDate).toBe('2026-10-17')
    expect(result.title).toBe('Gọi điện hoặc thứ 2')
  })
})

describe('parseQuickAdd: priority, project, labels', () => {
  it.each([
    ['Sửa lỗi p1', 1],
    ['Sửa lỗi P2', 2],
    ['p3 Sửa lỗi', 3],
    ['Sửa lỗi p4', 4],
  ])('%s -> priority %i', (input, priority) => {
    const result = parse(input)
    expect(result.priority).toBe(priority)
    expect(result.title).toBe('Sửa lỗi')
  })

  it.each(['Sửa lỗi p5', 'Sửa lỗi p0', 'Sửa lỗi p11', 'Sửa lỗi ap1'])(
    'ignores invalid priority in "%s"',
    (input) => {
      expect(parse(input).priority).toBeNull()
      expect(parse(input).title).toBe(input)
    },
  )

  it.each([
    ['Viết chart #DoAnDevOps', 2],
    ['Viết chart #do-an-devops', 2],
    ['Viết chart #Đồ_án_DevOps', 2],
    ['Viết chart #canhan', 3],
  ])('matches project in "%s" ignoring accents, case and separators', (input, projectId) => {
    const result = parse(input)
    expect(result.projectId).toBe(projectId)
    expect(result.title).toBe('Viết chart')
  })

  it('leaves an unknown #project in the title', () => {
    const result = parse('Viết chart #khongco')

    expect(result.projectId).toBeNull()
    expect(result.title).toBe('Viết chart #khongco')
    expect(result.tokens).toEqual([])
  })

  it('resolves existing labels case-insensitively and marks new ones', () => {
    const result = parse('Gửi mail @work @khẩn @mới @work')

    expect(result.labels).toEqual([
      { name: 'Work', id: 11 },
      { name: 'khẩn', id: 10 },
      { name: 'mới', id: null },
    ])
    expect(result.title).toBe('Gửi mail')
  })

  it('parses everything together and reports token positions', () => {
    const input = 'Nộp báo cáo ngày mai p1 #DoAnDevOps @khẩn'
    const result = parse(input)

    expect(result).toMatchObject({
      title: 'Nộp báo cáo',
      dueDate: '2026-10-17',
      priority: 1,
      projectId: 2,
      labels: [{ name: 'khẩn', id: 10 }],
    })
    expect(result.tokens.map((t) => [t.type, input.slice(t.start, t.end)])).toEqual([
      ['date', 'ngày mai'],
      ['priority', 'p1'],
      ['project', '#DoAnDevOps'],
      ['label', '@khẩn'],
    ])
  })

  it('returns an empty title when the input is only tokens', () => {
    expect(parse('mai p1').title).toBe('')
  })

  it('keeps ignored tokens as plain title text', () => {
    const first = parse('Họp với Mai')
    expect(first.dueDate).toBe('2026-10-17')

    const ignored = parse('Họp với Mai', { ignore: new Set([first.tokens[0].key]) })

    expect(ignored.dueDate).toBeNull()
    expect(ignored.title).toBe('Họp với Mai')
    expect(ignored.tokens).toEqual([])
  })

  it('collapses extra whitespace in the title', () => {
    expect(parse('  Viết   test   mai  ').title).toBe('Viết test')
  })
})

describe('parseQuickAdd: time and duration', () => {
  it.each([
    // [input, due date, time, title]
    ['Họp nhóm mai 9h', '2026-10-17', '09:00', 'Họp nhóm'],
    ['Họp nhóm mai 9h30', '2026-10-17', '09:30', 'Họp nhóm'],
    ['Họp nhóm mai lúc 14:30', '2026-10-17', '14:30', 'Họp nhóm'],
    ['Họp nhóm mai luc 7h', '2026-10-17', '07:00', 'Họp nhóm'],
    ['Call team tomorrow at 9am', '2026-10-17', '09:00', 'Call team'],
    ['Call team tomorrow 2pm', '2026-10-17', '14:00', 'Call team'],
    ['Call team tomorrow 12am', '2026-10-17', '00:00', 'Call team'],
    ['Đá bóng thứ 7 3h chiều', '2026-10-17', '15:00', 'Đá bóng'],
    ['Ăn tối 7h tối mai', '2026-10-17', '19:00', 'Ăn tối'],
    ['Họp 1h trưa thứ 2', '2026-10-19', '13:00', 'Họp'],
    ['Chạy bộ 6h sáng mai', '2026-10-17', '06:00', 'Chạy bộ'],
    ['Nộp bài 23:59', '2026-10-16', '23:59', 'Nộp bài'], // time only -> today
    ['Tập gym 7h', '2026-10-17', '07:00', 'Tập gym'], // already past now (09:15) -> tomorrow
  ])('%s', (input, due, time, title) => {
    const result = parse(input, { now: '09:15' })
    expect(result.dueDate).toBe(due)
    expect(result.dueTime).toBe(time)
    expect(result.title).toBe(title)
  })

  it.each([
    ['Ôn thi mai 8h trong 2 tiếng', 120],
    ['Ôn thi mai 8h trong 90 phút', 90],
    ['Ôn thi mai 8h trong 1h30', 90],
    ['Ôn thi mai 8h trong 45p', 45],
    ['Study tomorrow 8am for 2h', 120],
    ['Study tomorrow 8am for 30 minutes', 30],
  ])('%s -> %i minutes', (input, minutes) => {
    const result = parse(input)
    expect(result.duration).toBe(minutes)
    expect(result.dueTime).toBe('08:00')
    expect(result.title).toBe(input.startsWith('Study') ? 'Study' : 'Ôn thi')
  })

  it.each([
    'Đọc trong nhà', // "trong" without an amount
    'Gift for mom',
    'Phòng 25h', // invalid hour
    'Lúc nào cũng được', // "lúc" without a time
    'Chạy 9h99',
  ])('finds no time or duration in "%s"', (input) => {
    const result = parse(input)
    expect(result.dueTime).toBeNull()
    expect(result.duration).toBeNull()
    expect(result.title).toBe(input)
  })

  it('uses the editor default date for a bare time, but an explicit date wins', () => {
    expect(parse('Ôn tập 14h', { defaultDate: '2026-10-14' }).dueDate).toBe('2026-10-14')
    expect(parse('Ôn tập mai 14h', { defaultDate: '2026-10-14' }).dueDate).toBe('2026-10-17')
  })

  it('ignores durations outside 15 minutes – 12 hours', () => {
    expect(parse('Nghỉ mai 9h trong 5 phút').duration).toBeNull()
    expect(parse('Nghỉ mai 9h trong 13 tiếng').duration).toBeNull()
  })

  it('reports the time token including "lúc" and the period word', () => {
    const input = 'Họp lúc 3h chiều mai'
    const result = parse(input)
    const token = result.tokens.find((t) => t.type === 'time')!
    expect(input.slice(token.start, token.end)).toBe('lúc 3h chiều')
  })
})
