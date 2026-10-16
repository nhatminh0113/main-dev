import { Dialog } from './Dialog'
import styles from './ShortcutsDialog.module.css'

const SHORTCUTS: Array<[string[], string]> = [
  [['q'], 'Thêm nhanh công việc'],
  [['/'], 'Tìm kiếm'],
  [['g', 'i'], 'Đi tới Hộp thư đến'],
  [['g', 't'], 'Đi tới Hôm nay'],
  [['g', 'u'], 'Đi tới Sắp tới'],
  [['?'], 'Mở bảng phím tắt'],
  [['Esc'], 'Đóng hộp thoại'],
]

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog open={open} onClose={onClose} title="Phím tắt" size="sm">
      <table className={styles.table}>
        <thead className="visually-hidden">
          <tr>
            <th scope="col">Phím</th>
            <th scope="col">Hành động</th>
          </tr>
        </thead>
        <tbody>
          {SHORTCUTS.map(([keys, action]) => (
            <tr key={action}>
              <td>
                {keys.map((k, i) => (
                  <span key={k}>
                    {i > 0 && <span className={styles.then}> rồi </span>}
                    <kbd className={styles.kbd}>{k}</kbd>
                  </span>
                ))}
              </td>
              <td>{action}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className={styles.note}>Phím tắt không hoạt động khi đang gõ trong ô nhập.</p>
    </Dialog>
  )
}
