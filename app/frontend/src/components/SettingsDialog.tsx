import { useId } from 'react'
import { useFeatures, useSetFeature } from '../api/hooks'
import type { FeatureFlag } from '../api/types'
import { Dialog } from './Dialog'
import styles from './SettingsDialog.module.css'
import { TaskSkeleton } from './Skeleton'

/** Human names for known flags; unknown keys fall back to the key itself. */
const FLAG_LABELS: Record<string, string> = { export_csv: 'Xuất CSV', week_view: 'Lịch tuần' }

export function SettingsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Cài đặt" size="sm">
      <FeatureSettings />
    </Dialog>
  )
}

function FeatureSettings() {
  const headingId = useId()
  const { data: flags, isPending, isError } = useFeatures()
  const setFeature = useSetFeature()
  const pendingKey = setFeature.isPending ? setFeature.variables?.key : undefined

  return (
    <section aria-labelledby={headingId} className={styles.section}>
      <h3 id={headingId} className={styles.heading}>
        Tính năng thử nghiệm
      </h3>
      {isPending && <TaskSkeleton rows={2} />}
      {isError && !flags && (
        <p role="alert" className={styles.error}>
          Không tải được danh sách tính năng
        </p>
      )}
      {flags && (
        <ul className={styles.list}>
          {flags.map((flag) => (
            <FlagRow
              key={flag.key}
              flag={flag}
              pending={pendingKey === flag.key}
              onToggle={(enabled) => setFeature.mutate({ key: flag.key, enabled })}
            />
          ))}
        </ul>
      )}
      {setFeature.isError && (
        <p role="alert" className={styles.error}>
          Không đổi được tính năng, thử lại.
        </p>
      )}
      <p className={styles.note}>
        Máy chủ áp dụng thay đổi cho mọi người dùng trong vài giây. Giao diện của người khác cập nhật
        khi tải lại trang hoặc quay lại tab.
      </p>
    </section>
  )
}

function FlagRow({
  flag,
  pending,
  onToggle,
}: {
  flag: FeatureFlag
  pending: boolean
  onToggle: (enabled: boolean) => void
}) {
  const id = useId()
  const inputId = `${id}-switch`
  const descId = `${id}-desc`
  return (
    <li className={styles.row}>
      <div className={styles.text}>
        <label htmlFor={inputId} className={styles.label}>
          {FLAG_LABELS[flag.key] ?? flag.key}
        </label>
        <p id={descId} className={styles.description}>
          {flag.description}
        </p>
      </div>
      {/* Native checkbox: Tab to focus, Space to toggle; role="switch" announces on/off. */}
      <input
        id={inputId}
        type="checkbox"
        role="switch"
        className={styles.switch}
        checked={flag.enabled}
        disabled={pending}
        aria-describedby={descId}
        onChange={(e) => onToggle(e.target.checked)}
      />
    </li>
  )
}
