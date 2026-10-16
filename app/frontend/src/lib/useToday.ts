import { useEffect, useState } from 'react'
import { todayISO } from './dates'

/** Today's local date (ISO). Re-renders just after midnight so views never go stale. */
export function useToday(): string {
  const [today, setToday] = useState(todayISO)

  useEffect(() => {
    const now = new Date()
    const midnight = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1)
    const timer = setTimeout(() => setToday(todayISO()), midnight.getTime() - now.getTime() + 1000)
    return () => clearTimeout(timer)
  }, [today])

  return today
}
