import { NavLink } from 'react-router'
import { useLabels, useProjects, useTasks } from '../api/hooks'
import {
  CheckCircleIcon,
  ColorDot,
  KeyboardIcon,
  LogoMark,
  PlusIcon,
  QuickNoteIcon,
  SearchIcon,
  TagIcon,
  TodayIcon,
  UpcomingIcon,
  WeekIcon,
} from '../components/icons'
import { COLOR_HEX } from '../lib/colors'
import { useToday } from '../lib/useToday'
import styles from './Sidebar.module.css'
import { useUI } from './ui'

const linkClass = ({ isActive }: { isActive: boolean }) =>
  `${styles.link} ${isActive ? styles.active : ''}`

/** Badge with the number of open tasks; red when something is overdue. */
function Count({
  value,
  label = 'việc chưa xong',
  urgent = false,
}: {
  value: number | undefined
  label?: string
  urgent?: boolean
}) {
  if (!value) return null
  return (
    <span className={`${styles.count} ${urgent ? styles.urgent : ''}`}>
      <span className="visually-hidden"> </span>
      {value}
      <span className="visually-hidden"> {label}</span>
    </span>
  )
}

export function Sidebar() {
  const today = useToday()
  const { openQuickAdd, editProject, editLabel, openShortcuts } = useUI()
  const { data: projects = [] } = useProjects()
  const { data: labels = [] } = useLabels()
  const { data: todayTasks } = useTasks({ done: false, due_to: today })
  const overdue = todayTasks?.filter((t) => t.due_date! < today).length ?? 0
  const inbox = projects.find((p) => p.is_inbox)
  const others = projects.filter((p) => !p.is_inbox)

  return (
    <nav className={styles.sidebar} aria-label="Điều hướng chính">
      <div className={styles.brand}>
        <LogoMark />
        <span className={styles.brandName}>Taskapp</span>
      </div>

      <button type="button" className={styles.addTask} onClick={() => openQuickAdd()}>
        <span className={styles.addIcon}>
          <PlusIcon size={14} strokeWidth={2.4} />
        </span>
        Thêm công việc
        <kbd className={styles.kbd} aria-hidden="true">
          q
        </kbd>
      </button>

      <ul className={styles.list}>
        <li>
          <NavLink to="/search" className={linkClass}>
            <SearchIcon size={18} />
            <span className={styles.text}>Tìm kiếm</span>
            <kbd className={styles.kbd} aria-hidden="true">
              /
            </kbd>
          </NavLink>
        </li>
        <li>
          <NavLink to="/inbox" className={linkClass}>
            <QuickNoteIcon size={18} />
            <span className={styles.text}>Ghi nhanh</span>
            <Count value={inbox?.open_count} />
          </NavLink>
        </li>
        <li>
          <NavLink to="/today" className={linkClass}>
            <TodayIcon size={18} day={Number(today.slice(8))} />
            <span className={styles.text}>Hôm nay</span>
            <Count
              value={todayTasks?.length}
              urgent={overdue > 0}
              label={overdue ? `việc chưa xong, ${overdue} quá hạn` : 'việc chưa xong'}
            />
          </NavLink>
        </li>
        <li>
          <NavLink to="/upcoming" className={linkClass}>
            <UpcomingIcon size={18} />
            <span className={styles.text}>Sắp tới</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/week" className={linkClass}>
            <WeekIcon size={18} />
            <span className={styles.text}>Lịch tuần</span>
          </NavLink>
        </li>
        <li>
          <NavLink to="/completed" className={linkClass}>
            <CheckCircleIcon size={18} />
            <span className={styles.text}>Đã hoàn thành</span>
          </NavLink>
        </li>
      </ul>

      <SectionHeader title="Dự án" addLabel="Thêm dự án" onAdd={() => editProject()} />
      <ul className={styles.list} aria-label="Dự án">
        {others.map((p) => (
          <li key={p.id}>
            <NavLink to={`/project/${p.id}`} className={linkClass}>
              <span className={styles.dotWrap}>
                <ColorDot color={COLOR_HEX[p.color]} />
              </span>
              <span className={styles.text}>{p.name}</span>
              <Count value={p.open_count} />
            </NavLink>
          </li>
        ))}
        {others.length === 0 && <li className={styles.hint}>Chưa có dự án</li>}
      </ul>

      <SectionHeader title="Nhãn" addLabel="Thêm nhãn" onAdd={() => editLabel()} />
      <ul className={styles.list} aria-label="Nhãn">
        {labels.map((l) => (
          <li key={l.id}>
            <NavLink to={`/label/${l.id}`} className={linkClass}>
              <TagIcon size={18} style={{ color: COLOR_HEX[l.color] }} />
              <span className={styles.text}>{l.name}</span>
              <Count value={l.open_count} />
            </NavLink>
          </li>
        ))}
        {labels.length === 0 && <li className={styles.hint}>Chưa có nhãn</li>}
      </ul>

      <button type="button" className={styles.footer} onClick={openShortcuts}>
        <KeyboardIcon size={16} />
        Phím tắt
        <kbd className={styles.kbd} aria-hidden="true">
          ?
        </kbd>
      </button>
    </nav>
  )
}

function SectionHeader({
  title,
  addLabel,
  onAdd,
}: {
  title: string
  addLabel: string
  onAdd: () => void
}) {
  return (
    <div className={styles.sectionHeader}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      <button type="button" className="icon-btn" aria-label={addLabel} title={addLabel} onClick={onAdd}>
        <PlusIcon size={16} />
      </button>
    </div>
  )
}
