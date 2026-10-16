import { QueryClient } from '@tanstack/react-query'
import { render } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MemoryRouter } from 'react-router'
import { vi } from 'vitest'
import { AppProviders, AppRoutes } from '../App'
import { createFakeApi, type FakeApi } from './fakeApi'

/** Friday 16 October 2026, 09:00 local time. Only Date is faked so user-event timers work. */
export const TEST_NOW = new Date(2026, 9, 16, 9, 0, 0)

export function freezeTime() {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(TEST_NOW)
}

/** Render the whole app at `route` against a fresh fake API. */
export function renderApp(route = '/today', api: FakeApi = createFakeApi()) {
  vi.stubGlobal('fetch', api.fetch)
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, staleTime: 0 }, mutations: { retry: false } },
  })
  const user = userEvent.setup()
  const utils = render(
    <AppProviders client={client}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </AppProviders>,
  )
  return { ...utils, user, api, client }
}
