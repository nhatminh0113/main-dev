import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react'
import { CheckIcon } from './icons'
import styles from './Toast.module.css'

interface ToastOptions {
  message: string
  action?: { label: string; onClick: () => void }
  tone?: 'success' | 'error'
}

interface ToastState extends ToastOptions {
  id: number
}

const ToastContext = createContext<(options: ToastOptions) => void>(() => {})

export const TOAST_DURATION_MS = 5000

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const nextId = useRef(1)

  const dismiss = useCallback(() => {
    clearTimeout(timer.current)
    setToast(null)
  }, [])

  const show = useCallback(
    (options: ToastOptions) => {
      clearTimeout(timer.current)
      setToast({ ...options, id: nextId.current++ })
      timer.current = setTimeout(dismiss, TOAST_DURATION_MS)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      {/* Always mounted so screen readers announce new messages. */}
      <div className={styles.region} role="status" aria-live="polite">
        {toast && (
          <div key={toast.id} className={`${styles.toast} ${toast.tone === 'error' ? styles.error : ''}`}>
            {toast.tone !== 'error' && (
              <span className={styles.icon}>
                <CheckIcon size={14} />
              </span>
            )}
            <span className={styles.message}>{toast.message}</span>
            {toast.action && (
              <button
                type="button"
                className={styles.action}
                onClick={() => {
                  toast.action?.onClick()
                  dismiss()
                }}
              >
                {toast.action.label}
              </button>
            )}
            <button type="button" className={styles.close} aria-label="Đóng thông báo" onClick={dismiss}>
              ×
            </button>
          </div>
        )}
      </div>
    </ToastContext.Provider>
  )
}

// eslint-disable-next-line react-refresh/only-export-components
export const useToast = () => useContext(ToastContext)
