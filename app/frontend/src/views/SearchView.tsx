import { useEffect, useId, useState } from 'react'
import { useSearchParams } from 'react-router'
import { useTasks } from '../api/hooks'
import { EmptyState } from '../components/EmptyState'
import { SearchIcon } from '../components/icons'
import { TaskSection } from '../components/TaskSection'
import { QueryState } from './QueryState'
import { ViewHeader } from './ViewHeader'
import styles from './views.module.css'

const DEBOUNCE_MS = 250

export function SearchView() {
  const [params, setParams] = useSearchParams()
  const [input, setInput] = useState(params.get('q') ?? '')
  const inputId = useId()
  const q = (params.get('q') ?? '').trim()

  // Debounce typing into the URL (?q=) so results are shareable and Back works.
  useEffect(() => {
    const timer = setTimeout(() => {
      if (input.trim() !== q) setParams(input.trim() ? { q: input.trim() } : {}, { replace: true })
    }, DEBOUNCE_MS)
    return () => clearTimeout(timer)
  }, [input, q, setParams])

  const query = useTasks({ q, limit: 100 }, q.length > 0)
  const results = query.data ?? []

  return (
    <>
      <ViewHeader title="Tìm kiếm" />
      <div className={styles.search} role="search">
        <label htmlFor={inputId} className="visually-hidden">
          Tìm công việc
        </label>
        <SearchIcon size={18} className={styles.searchIcon} />
        <input
          id={inputId}
          type="search"
          className={`input ${styles.searchInput}`}
          placeholder="Tìm theo tên hoặc mô tả (không cần dấu)…"
          value={input}
          // eslint-disable-next-line jsx-a11y-x/no-autofocus -- the page exists to search
          autoFocus
          onChange={(e) => setInput(e.target.value)}
        />
      </div>

      {q === '' ? (
        <EmptyState art="search" title="Tìm mọi công việc">
          Tìm trong tiêu đề và mô tả, kể cả việc đã hoàn thành. Ví dụ: “hoc” sẽ tìm thấy “Học”.
        </EmptyState>
      ) : (
        <QueryState isPending={query.isPending} error={query.error} onRetry={() => query.refetch()}>
          <p className="visually-hidden" role="status">
            {results.length} kết quả cho “{q}”
          </p>
          {results.length > 0 ? (
            <TaskSection heading={`Kết quả cho “${q}”`} tasks={results} showProject />
          ) : (
            <EmptyState art="search" title={`Không tìm thấy “${q}”`}>
              Thử từ khóa khác hoặc ngắn hơn.
            </EmptyState>
          )}
        </QueryState>
      )}
    </>
  )
}
