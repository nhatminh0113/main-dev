import { Link } from 'react-router'
import { EmptyState } from '../components/EmptyState'
import { ViewHeader } from './ViewHeader'
import styles from './views.module.css'

export function NotFoundView() {
  return (
    <>
      <ViewHeader title="Không tìm thấy trang" />
      <EmptyState art="search" title="Trang này không tồn tại hoặc đã bị xóa">
        <Link to="/today" className={styles.linkButton}>
          Về trang Hôm nay
        </Link>
      </EmptyState>
    </>
  )
}
