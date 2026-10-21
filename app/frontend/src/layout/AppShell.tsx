import { useEffect, useMemo, useState } from 'react'
import { Outlet, useLocation, useNavigate } from 'react-router'
import { Dialog } from '../components/Dialog'
import { MenuIcon } from '../components/icons'
import { NameColorDialog, type EditTarget } from '../components/NameColorDialog'
import { QuickAdd } from '../components/QuickAdd'
import { ShortcutsDialog } from '../components/ShortcutsDialog'
import { TaskDialog } from '../components/TaskDialog'
import { useHotkeys } from '../lib/useHotkeys'
import styles from './AppShell.module.css'
import { Sidebar } from './Sidebar'
import { UIContext, type QuickAddDefaults, type UIActions } from './ui'

/** Views that use the full content width instead of the reading column. */
const WIDE_ROUTES = new Set(['/week'])

export function AppShell() {
  const navigate = useNavigate()
  const location = useLocation()
  const [menuOpen, setMenuOpen] = useState(false)
  const [quickAdd, setQuickAdd] = useState<QuickAddDefaults | null>(null)
  const [taskId, setTaskId] = useState<number | null>(null)
  const [editTarget, setEditTarget] = useState<EditTarget>(null)
  const [shortcutsOpen, setShortcutsOpen] = useState(false)

  // Close the mobile drawer after navigating.
  // eslint-disable-next-line react-hooks/set-state-in-effect -- reacting to route changes
  useEffect(() => setMenuOpen(false), [location.pathname])

  const actions = useMemo<UIActions>(
    () => ({
      openQuickAdd: (defaults = {}) => setQuickAdd(defaults),
      openTask: (id) => setTaskId(id),
      editProject: (item) => setEditTarget({ kind: 'project', item }),
      editLabel: (item) => setEditTarget({ kind: 'label', item }),
      openShortcuts: () => setShortcutsOpen(true),
    }),
    [],
  )

  useHotkeys({
    q: () => setQuickAdd({}),
    '/': () => navigate('/search'),
    '?': () => setShortcutsOpen(true),
    'g i': () => navigate('/inbox'),
    'g t': () => navigate('/today'),
    'g u': () => navigate('/upcoming'),
    'g w': () => navigate('/week'),
  })

  return (
    <UIContext.Provider value={actions}>
      <div className={styles.shell}>
        <a href="#main" className={styles.skip}>
          Bỏ qua tới nội dung chính
        </a>

        <aside
          id="sidebar"
          className={`${styles.sidebar} ${menuOpen ? styles.open : ''}`}
          aria-label="Thanh bên"
        >
          <Sidebar />
        </aside>
        {menuOpen && (
          <div className={styles.backdrop} aria-hidden="true" onClick={() => setMenuOpen(false)} />
        )}

        <div className={styles.content}>
          <div className={styles.topbar}>
            <button
              type="button"
              className="icon-btn"
              aria-label={menuOpen ? 'Đóng menu' : 'Mở menu'}
              aria-expanded={menuOpen}
              aria-controls="sidebar"
              onClick={() => setMenuOpen((o) => !o)}
            >
              <MenuIcon />
            </button>
          </div>
          <main
            id="main"
            className={`${styles.main} ${WIDE_ROUTES.has(location.pathname) ? styles.wide : ''}`}
            tabIndex={-1}
          >
            <Outlet />
          </main>
        </div>
      </div>

      <Dialog open={quickAdd !== null} onClose={() => setQuickAdd(null)} title="Thêm nhanh công việc" hideTitle>
        {quickAdd !== null && (
          <QuickAdd focusOnMount showHint defaults={quickAdd} onClose={() => setQuickAdd(null)} />
        )}
      </Dialog>
      <TaskDialog taskId={taskId} onClose={() => setTaskId(null)} />
      <NameColorDialog target={editTarget} onClose={() => setEditTarget(null)} />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />
    </UIContext.Provider>
  )
}
