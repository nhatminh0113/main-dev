import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { ViewHeader } from './ViewHeader'
import styles from './views.module.css'

/** Shown on the route of a view whose feature flag is off (e.g. /week). */
export function FeatureOffView({ title, featureName }: { title: string; featureName: string }) {
  return (
    <>
      <ViewHeader title={title} />
      <EmptyState art="calendar" title={`Tính năng ${featureName} đang tắt`}>
        Bật lại trong Cài đặt → Tính năng thử nghiệm.{' '}
        <Link to="/today" className={styles.linkButton}>
          Về trang Hôm nay
        </Link>
      </EmptyState>
    </>
  )
}
