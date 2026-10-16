import { useEffect, useLayoutEffect, useRef } from 'react'

export type HotkeyMap = Record<string, () => void>

const SEQUENCE_TIMEOUT_MS = 1000

function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    target instanceof HTMLInputElement ||
    target instanceof HTMLTextAreaElement ||
    target instanceof HTMLSelectElement
  )
}

/**
 * Global single-key shortcuts ("q", "/", "?") and two-key sequences ("g i").
 * Ignored while typing, while a modal dialog is open, or with Ctrl/Alt/Meta held.
 */
export function useHotkeys(map: HotkeyMap) {
  const mapRef = useRef(map)
  useLayoutEffect(() => {
    mapRef.current = map
  })
  const pending = useRef<{ key: string; at: number } | null>(null)

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.defaultPrevented) return
      if (isTyping(e.target) || document.querySelector('dialog[open]')) return

      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key
      const now = Date.now()
      const prev = pending.current
      if (prev && now - prev.at < SEQUENCE_TIMEOUT_MS) {
        const sequence = mapRef.current[`${prev.key} ${key}`]
        pending.current = null
        if (sequence) {
          e.preventDefault()
          sequence()
          return
        }
      }

      const isPrefix = Object.keys(mapRef.current).some((k) => k.startsWith(`${key} `))
      if (isPrefix) {
        pending.current = { key, at: now }
        return
      }

      const handler = mapRef.current[e.key] ?? mapRef.current[key]
      if (handler) {
        e.preventDefault()
        handler()
      }
    }
    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [])
}
