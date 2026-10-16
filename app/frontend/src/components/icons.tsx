import type { ReactNode, SVGProps } from 'react'

/** Line icons drawn on a 24px grid, 1.6px stroke. Always decorative (aria-hidden). */
type IconProps = Omit<SVGProps<SVGSVGElement>, 'children'> & { size?: number }

function Svg({ size = 20, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.6}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  )
}

export const PlusIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M12 5v14M5 12h14" />
  </Svg>
)

export const SearchIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m16 16 4 4" />
  </Svg>
)

/** "Ghi nhanh" (quick capture): a note with a pencil. */
export const QuickNoteIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M13 4H6a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-6" />
    <path d="M8.5 9h4M8.5 13h3" />
    <path d="m14 14 .6-2.6L20 6a1.4 1.4 0 0 1 2 2l-5.4 5.4z" />
  </Svg>
)

export function TodayIcon({ day, ...p }: IconProps & { day: number }) {
  return (
    <Svg {...p}>
      <rect x="4" y="5" width="16" height="15" rx="2.5" />
      <path d="M4 9.5h16" />
      <text
        x="12"
        y="17.6"
        textAnchor="middle"
        fontSize="7.5"
        fontWeight="700"
        fill="currentColor"
        stroke="none"
      >
        {day}
      </text>
    </Svg>
  )
}

export const UpcomingIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M4 9.5h16M8 3.5v3M16 3.5v3M8.5 13.5h1M11.5 13.5h1M14.5 13.5h1M8.5 16.5h1M11.5 16.5h1" />
  </Svg>
)

export const CheckCircleIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="m8.5 12 2.5 2.5 4.5-5" />
  </Svg>
)

export const CheckIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 12.5 4 4 8-9" />
  </Svg>
)

export const TagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 12.5V5a1 1 0 0 1 1-1h7.5l8 8-8.5 8.5z" />
    <circle cx="8.5" cy="8.5" r="1.2" fill="currentColor" stroke="none" />
  </Svg>
)

export const FlagIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M6 20V4.5M6 5h11l-2.5 4L17 13H6" />
  </Svg>
)

export const ClockIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
)

/** Week timetable: calendar with columns. */
export const WeekIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M4 9.5h16M9.3 9.5V20M14.7 9.5V20" />
  </Svg>
)

export const ChevronLeftIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m14 7-5 5 5 5" />
  </Svg>
)

export const ChevronRightIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m10 7 5 5-5 5" />
  </Svg>
)

export const CalendarIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="4" y="5" width="16" height="15" rx="2.5" />
    <path d="M4 9.5h16M8 3.5v3M16 3.5v3" />
  </Svg>
)

export const PencilIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m5 19 1-4L15.5 5.5a2.1 2.1 0 0 1 3 3L9 18z" />
  </Svg>
)

export const TrashIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M10 7V5h4v2M7 7l1 12h8l1-12" />
  </Svg>
)

export const MoreIcon = (p: IconProps) => (
  <Svg {...p}>
    <circle cx="6" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="12" cy="12" r="1.3" fill="currentColor" stroke="none" />
    <circle cx="18" cy="12" r="1.3" fill="currentColor" stroke="none" />
  </Svg>
)

export const MenuIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Svg>
)

export const CloseIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m6 6 12 12M18 6 6 18" />
  </Svg>
)

export const ChevronDownIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="m7 10 5 5 5-5" />
  </Svg>
)

export const SubtaskIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M7 4v11a2 2 0 0 0 2 2h8M7 9h10" />
  </Svg>
)

export const DescriptionIcon = (p: IconProps) => (
  <Svg {...p}>
    <path d="M5 7h14M5 12h14M5 17h9" />
  </Svg>
)

export const KeyboardIcon = (p: IconProps) => (
  <Svg {...p}>
    <rect x="3" y="6" width="18" height="12" rx="2" />
    <path d="M7 10h.01M11 10h.01M15 10h.01M7 14h10" />
  </Svg>
)

export function LogoMark({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <rect width="24" height="24" rx="7" fill="#5b5bd6" />
      <path
        d="m6.5 12.5 3.5 3.5 7.5-8"
        fill="none"
        stroke="#fff"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** Small filled dot used for project and label colours. */
export function ColorDot({ color, size = 10 }: { color: string; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 10 10" aria-hidden="true" focusable="false">
      <circle cx="5" cy="5" r="5" fill={color} />
    </svg>
  )
}
