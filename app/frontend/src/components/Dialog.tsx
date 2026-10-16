import { useEffect, useRef, type ReactNode } from 'react'
import { CloseIcon } from './icons'
import styles from './Dialog.module.css'

interface DialogProps {
  open: boolean
  onClose: () => void
  /** Accessible name; shown as a heading unless `hideTitle`. */
  title: string
  hideTitle?: boolean
  size?: 'sm' | 'md' | 'lg'
  children: ReactNode
  /** Rendered in the header next to the close button. */
  headerActions?: ReactNode
}

/**
 * Modal built on the native <dialog>: the browser provides the focus trap,
 * Esc to close, inert background and focus restoration.
 */
export function Dialog({
  open,
  onClose,
  title,
  hideTitle = false,
  size = 'md',
  children,
  headerActions,
}: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null)

  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) {
      dialog.showModal()
      // React's autoFocus runs before the dialog is open (and is lost); focus explicitly.
      dialog.querySelector<HTMLElement>('[data-autofocus]')?.focus()
    }
    if (!open && dialog.open) dialog.close()
  }, [open])

  // onMouseDown: clicking the backdrop (the <dialog> element itself) closes it. This is a
  // mouse-only convenience; keyboard users close with Esc (native) or the close button.
  return (
    // eslint-disable-next-line jsx-a11y-x/no-noninteractive-element-interactions
    <dialog
      ref={ref}
      className={`${styles.dialog} ${styles[size]}`}
      aria-label={title}
      onClose={onClose}
      onCancel={(e) => {
        e.preventDefault()
        onClose()
      }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      {open && (
        <div className={styles.inner}>
          <header className={styles.header}>
            <h2 className={hideTitle ? 'visually-hidden' : styles.title}>{title}</h2>
            <div className={styles.headerActions}>
              {headerActions}
              <button type="button" className="icon-btn" aria-label="Đóng" onClick={onClose}>
                <CloseIcon size={18} />
              </button>
            </div>
          </header>
          {children}
        </div>
      )}
    </dialog>
  )
}
