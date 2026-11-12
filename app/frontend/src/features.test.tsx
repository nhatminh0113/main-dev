import { screen, waitFor, within } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { EXPORT_MAX_POLLS, EXPORT_POLL_MS } from './api/hooks'
import { createFakeApi, type FakeApi } from './test/fakeApi'
import { TEST_NOW, freezeTime, renderApp } from './test/render'

beforeEach(freezeTime)
afterEach(() => {
  vi.useRealTimers()
})

const nav = () => screen.getByRole('navigation', { name: 'Điều hướng chính' })
const weekLink = () => within(nav()).queryByRole('link', { name: /Lịch tuần/ })
const exportButton = () => screen.queryByRole('button', { name: 'Xuất CSV' })

/** Wait until the flags request has settled (success or error). */
async function flagsSettled(client: ReturnType<typeof renderApp>['client'], status = 'success') {
  await waitFor(() => expect(client.getQueryState(['features'])?.status).toBe(status))
}

function apiWith(flags: Record<string, boolean>): FakeApi {
  const api = createFakeApi()
  for (const [key, enabled] of Object.entries(flags)) api.setFeature(key, enabled)
  return api
}

describe('week_view flag', () => {
  it('shows the Week nav link by default and /week renders the timetable', async () => {
    const { client } = renderApp('/week')
    await flagsSettled(client)

    expect(weekLink()).toHaveAttribute('href', '/week')
    expect(await screen.findByText(/Tuần 42 · 12 – 18 tháng 10, 2026/)).toBeInTheDocument()
  })

  it('hides the nav link and shows a friendly message on /week when off', async () => {
    const { client } = renderApp('/week', apiWith({ week_view: false }))
    await flagsSettled(client)

    await waitFor(() => expect(weekLink()).toBeNull())
    expect(screen.getByRole('heading', { level: 1, name: 'Lịch tuần' })).toBeInTheDocument()
    expect(screen.getByText('Tính năng Lịch tuần đang tắt')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Về trang Hôm nay' })).toHaveAttribute('href', '/today')
    expect(screen.queryByText(/Tuần 42/)).not.toBeInTheDocument()
  })
})

describe('export_csv flag and the export button', () => {
  it('shows the export button only when the flag is on', async () => {
    const off = renderApp('/today')
    await flagsSettled(off.client)
    expect(exportButton()).toBeNull()
    off.unmount()

    renderApp('/today', apiWith({ export_csv: true }))
    expect(await screen.findByRole('button', { name: 'Xuất CSV' })).toBeEnabled()
  })

  it('creates an export, polls it and offers the download link', async () => {
    const api = apiWith({ export_csv: true })
    const { user } = renderApp('/today', api)

    await user.click(await screen.findByRole('button', { name: 'Xuất CSV' }))

    expect(await screen.findByText('Đang tạo tệp CSV…')).toHaveAttribute('role', 'status')
    expect(screen.getByRole('button', { name: 'Đang xuất…' })).toHaveAttribute('aria-busy', 'true')
    const link = await screen.findByRole('link', { name: 'Tải tệp CSV' }, { timeout: 4000 })
    const [id] = [...api.state.exports.keys()]
    expect(link).toHaveAttribute('href', `/api/exports/${id}/download`)
    expect(link).toHaveAttribute('download')
    expect(screen.getByText('Tệp CSV đã sẵn sàng')).toHaveAttribute('role', 'status')

    await user.click(screen.getByRole('button', { name: 'Xuất lại' }))
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled()
  })

  it('reports a failed export and retries', async () => {
    const api = apiWith({ export_csv: true })
    api.exportOutcome = 'failed'
    const { user } = renderApp('/today', api)

    await user.click(await screen.findByRole('button', { name: 'Xuất CSV' }))
    const alert = await screen.findByRole('alert', {}, { timeout: 4000 })
    expect(alert).toHaveTextContent('Xuất CSV thất bại.')

    api.exportOutcome = 'done'
    await user.click(within(alert).getByRole('button', { name: 'Thử lại' }))
    expect(await screen.findByRole('link', { name: 'Tải tệp CSV' }, { timeout: 4000 })).toBeInTheDocument()
    expect(api.state.exports.size).toBe(2)
  })

  it('on 403 shows a toast and removes the button once the flags are refreshed', async () => {
    const api = apiWith({ export_csv: true })
    const { user } = renderApp('/today', api)
    const button = await screen.findByRole('button', { name: 'Xuất CSV' })

    api.setFeature('export_csv', false) // switched off by someone else meanwhile
    await user.click(button)

    const toast = await screen.findByText('Tính năng xuất CSV đang tắt.')
    expect(toast.closest('[role="status"]')).toHaveAttribute('aria-live', 'polite')
    await waitFor(() => expect(exportButton()).toBeNull())
    expect(screen.getByText('Tính năng xuất CSV đang tắt.')).toBeInTheDocument() // toast outlives it
    expect(api.state.exports.size).toBe(0)
  })

  it('gives up after the maximum number of polls', async () => {
    // clear* must be faked too, or react-query cannot stop its (fake) polling interval.
    // shouldAdvanceTime lets Testing Library's internal setTimeout(0) after user.click resolve.
    vi.useFakeTimers({
      toFake: ['Date', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval'],
      shouldAdvanceTime: true,
    })
    vi.setSystemTime(TEST_NOW)
    const api = apiWith({ export_csv: true })
    api.exportOutcome = 'running' // never finishes
    const { user } = renderApp('/today', api, { advanceTimers: vi.advanceTimersByTime })

    await vi.advanceTimersByTimeAsync(100) // flags load
    await user.click(screen.getByRole('button', { name: 'Xuất CSV' }))
    await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * (EXPORT_MAX_POLLS + 1))

    expect(screen.getByRole('alert')).toHaveTextContent('Quá thời gian chờ, thử lại sau.')
    const [entry] = [...api.state.exports.values()]
    expect(entry.polls).toBe(EXPORT_MAX_POLLS)
    expect(screen.getByRole('button', { name: 'Xuất CSV' })).toBeEnabled()

    await vi.advanceTimersByTimeAsync(EXPORT_POLL_MS * 5)
    expect(entry.polls).toBe(EXPORT_MAX_POLLS) // polling stopped
  })
})

describe('Settings dialog', () => {
  async function openSettings(user: ReturnType<typeof renderApp>['user']) {
    await user.click(screen.getByRole('button', { name: 'Cài đặt' }))
    return screen.findByRole('dialog', { name: 'Cài đặt' })
  }

  it('lists the flags as labelled switches and toggles with the keyboard', async () => {
    const { user, api } = renderApp('/today')
    const dialog = await openSettings(user)

    expect(within(dialog).getByRole('heading', { name: 'Tính năng thử nghiệm' })).toBeInTheDocument()
    const week = await within(dialog).findByRole('switch', { name: 'Lịch tuần' })
    const exportSwitch = within(dialog).getByRole('switch', { name: 'Xuất CSV' })
    expect(week).toBeChecked()
    expect(exportSwitch).not.toBeChecked()
    expect(week).toHaveAccessibleDescription('Màn Lịch tuần dạng thời khóa biểu')

    within(dialog).getByRole('button', { name: 'Đóng' }).focus()
    for (let i = 0; i < 5 && document.activeElement !== week; i++) await user.tab()
    expect(week).toHaveFocus()
    await user.keyboard(' ')

    await waitFor(() =>
      expect(api.fetch).toHaveBeenCalledWith(
        '/api/features/week_view',
        expect.objectContaining({ method: 'PATCH', body: JSON.stringify({ enabled: false }) }),
      ),
    )
    await waitFor(() => expect(week).not.toBeChecked())
    await waitFor(() => expect(weekLink()).toBeNull())
  })

  it('shows an alert when a toggle fails and keeps the server state', async () => {
    const { user, api } = renderApp('/today')
    const dialog = await openSettings(user)
    const week = await within(dialog).findByRole('switch', { name: 'Lịch tuần' })

    api.failNext('PATCH', '/api/features/week_view', 500, 'boom')
    await user.click(week)

    expect(await within(dialog).findByRole('alert')).toHaveTextContent(
      'Không đổi được tính năng, thử lại.',
    )
    expect(week).toBeChecked()
    expect(weekLink()).toBeInTheDocument()
  })

  it('falls back to the defaults when the flags cannot be loaded', async () => {
    const api = createFakeApi()
    api.failNext('GET', '/api/features', 500, 'down')
    const { user, client } = renderApp('/today', api)
    await flagsSettled(client, 'error')

    expect(weekLink()).toBeInTheDocument()
    expect(exportButton()).toBeNull()
    api.failNext('GET', '/api/features', 500, 'down') // the dialog's refetch fails too
    const dialog = await openSettings(user)
    expect(within(dialog).getByRole('alert')).toHaveTextContent('Không tải được danh sách tính năng')
  })
})
