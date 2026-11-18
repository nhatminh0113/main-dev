import { useEffect, useId, useRef, useState, type ReactNode } from 'react'
import styles from './Popover.module.css'

interface PopoverProps {
  /** Accessible name of the panel, e.g. "Chọn ngày". */
  label: string
  /** Renders the trigger; spread `props` onto a <button>. */
  trigger: (props: {
    id: string
    'aria-expanded': boolean
    'aria-controls': string
    'aria-haspopup': 'dialog'
    onClick: () => void
  }) => ReactNode
  children: (close: () => void) => ReactNode
  align?: 'start' | 'end'
}

/**
 * Small non-modal popover: opens below its trigger, moves focus inside,
 * closes on Esc / outside click and returns focus to the trigger.
 */
export function Popover({ label, trigger, children, align = 'start' }: PopoverProps) {
  const [open, setOpen] = useState(false)
  const panelId = useId()
  const triggerId = useId()
  const rootRef = useRef<HTMLDivElement>(null)
  const panelRef = useRef<HTMLDivElement>(null)

  const close = () => {
    setOpen(false)
    document.getElementById(triggerId)?.focus()
  }

  useEffect(() => {
    if (!open) return
    const first = panelRef.current?.querySelector<HTMLElement>(
      'input, button:not(:disabled), select, [tabindex]:not([tabindex="-1"])',
    )
    first?.focus()

    const onPointerDown = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [open])

  return (
    <div className={styles.root} ref={rootRef}>
      {trigger({
        id: triggerId,
        'aria-expanded': open,
        'aria-controls': panelId,
        'aria-haspopup': 'dialog',
        onClick: () => setOpen((o) => !o),
      })}
      {open && (
        // Esc handling for a non-modal dialog is the expected keyboard interaction.
        // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
        <div
          ref={panelRef}
          id={panelId}
          role="dialog"
          aria-label={label}
          className={`${styles.panel} ${align === 'end' ? styles.end : ''}`}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              // Do not let a parent <dialog> close as well.
              e.stopPropagation()
              e.preventDefault()
              close()
            }
          }}
        >
          {children(close)}
        </div>
      )}
    </div>
  )
}
