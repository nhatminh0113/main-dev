import { QueryClientProvider, type QueryClient } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { Navigate, Route, Routes } from 'react-router'
import { ToastProvider } from './components/Toast'
import { AppShell } from './layout/AppShell'
import { CompletedView } from './views/CompletedView'
import { LabelRoute } from './views/LabelView'
import { NotFoundView } from './views/NotFoundView'
import { InboxRoute, ProjectRoute } from './views/ProjectView'
import { SearchView } from './views/SearchView'
import { TodayView } from './views/TodayView'
import { UpcomingView } from './views/UpcomingView'

export function AppProviders({ client, children }: { client: QueryClient; children: ReactNode }) {
  return (
    <QueryClientProvider client={client}>
      <ToastProvider>{children}</ToastProvider>
    </QueryClientProvider>
  )
}

export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route index element={<Navigate to="/today" replace />} />
        <Route path="inbox" element={<InboxRoute />} />
        <Route path="today" element={<TodayView />} />
        <Route path="upcoming" element={<UpcomingView />} />
        <Route path="completed" element={<CompletedView />} />
        <Route path="search" element={<SearchView />} />
        <Route path="project/:id" element={<ProjectRoute />} />
        <Route path="label/:id" element={<LabelRoute />} />
        <Route path="*" element={<NotFoundView />} />
      </Route>
    </Routes>
  )
}
