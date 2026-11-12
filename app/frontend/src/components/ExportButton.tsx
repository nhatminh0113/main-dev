import { useQueryClient } from '@tanstack/react-query'
import { useEffect, useState } from 'react'
import { ApiError, exportDownloadUrl } from '../api/client'
import { EXPORT_MAX_POLLS, keys, useCreateExport, useExportJob } from '../api/hooks'
import styles from './ExportButton.module.css'
import { DownloadIcon } from './icons'
import { useToast } from './Toast'

type State = 'idle' | 'busy' | 'done' | 'failed' | 'timeout'

const isForbidden = (error: unknown) => error instanceof ApiError && error.status === 403

/**
 * "Xuất CSV": asks the backend for an export job (done by the worker), polls it, then offers
 * the file as a plain same-origin download link. Rendered only while `export_csv` is on.
 */
export function ExportButton() {
  const qc = useQueryClient()
  const toast = useToast()
  const [jobId, setJobId] = useState<number | null>(null)
  const create = useCreateExport()
  const job = useExportJob(jobId)

  // The flag was switched off meanwhile: say so (the toast outlives this button) and refresh
  // the flags, which removes the button.
  const pollForbidden = isForbidden(job.error)
  useEffect(() => {
    if (!pollForbidden) return
    toast({ message: 'Tính năng xuất CSV đang tắt.', tone: 'error' })
    void qc.invalidateQueries({ queryKey: keys.features })
  }, [pollForbidden, qc, toast])

  const start = () => {
    setJobId(null)
    create.mutate(undefined, {
      onSuccess: (created) => setJobId(created.id),
      onError: (error) => {
        if (!isForbidden(error)) return
        toast({ message: 'Tính năng xuất CSV đang tắt.', tone: 'error' })
        void qc.invalidateQueries({ queryKey: keys.features })
      },
    })
  }

  const reset = () => {
    setJobId(null)
    create.reset()
  }

  const status = job.data?.status
  // Reading dataUpdatedAt subscribes to every poll (the job data itself may not change),
  // so the timeout below is noticed as soon as the last poll lands.
  const polls =
    jobId === null || !job.dataUpdatedAt
      ? 0
      : (qc.getQueryState(keys.export(jobId))?.dataUpdateCount ?? 0)
  let state: State = 'idle'
  if (create.isPending) state = 'busy'
  else if (create.isError && !isForbidden(create.error)) state = 'failed'
  else if (jobId !== null && !pollForbidden) {
    if (status === 'done') state = 'done'
    else if (status === 'failed' || job.isError) state = 'failed'
    else if (polls >= EXPORT_MAX_POLLS) state = 'timeout'
    else state = 'busy'
  }
  const busy = state === 'busy'

  return (
    <div className={styles.wrap}>
      {state === 'done' && jobId !== null ? (
        <div className={styles.row}>
          <a href={exportDownloadUrl(jobId)} download className={`${styles.button} ${styles.link}`}>
            <DownloadIcon size={16} />
            Tải tệp CSV
          </a>
          <button type="button" className={styles.small} onClick={reset}>
            Xuất lại
          </button>
        </div>
      ) : state === 'failed' ? (
        <p role="alert" className={styles.error}>
          Xuất CSV thất bại.{' '}
          <button type="button" className={styles.small} onClick={start}>
            Thử lại
          </button>
        </p>
      ) : (
        <button
          type="button"
          className={styles.button}
          disabled={busy}
          aria-busy={busy || undefined}
          onClick={start}
        >
          <DownloadIcon size={16} />
          {busy ? 'Đang xuất…' : 'Xuất CSV'}
        </button>
      )}
      {state === 'timeout' && (
        <p role="alert" className={styles.error}>
          Quá thời gian chờ, thử lại sau.
        </p>
      )}
      {/* Always mounted so progress and completion are announced. */}
      <p role="status" className={styles.status}>
        {busy ? 'Đang tạo tệp CSV…' : state === 'done' ? 'Tệp CSV đã sẵn sàng' : ''}
      </p>
    </div>
  )
}
