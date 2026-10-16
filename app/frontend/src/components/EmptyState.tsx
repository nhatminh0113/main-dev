import type { ReactNode } from 'react'
import styles from './EmptyState.module.css'

type Art = 'done' | 'inbox' | 'calendar' | 'search' | 'project'

interface EmptyStateProps {
  art: Art
  title: string
  children?: ReactNode
}

export function EmptyState({ art, title, children }: EmptyStateProps) {
  return (
    <div className={styles.empty}>
      <Illustration art={art} />
      <p className={styles.title}>{title}</p>
      {children && <p className={styles.text}>{children}</p>}
    </div>
  )
}

/** Simple decorative illustrations drawn with the accent palette. */
function Illustration({ art }: { art: Art }) {
  return (
    <svg width="160" height="112" viewBox="0 0 160 112" aria-hidden="true" focusable="false">
      <ellipse cx="80" cy="100" rx="56" ry="6" fill="var(--color-surface-hover)" />
      {art === 'done' && (
        <>
          <circle cx="80" cy="50" r="38" fill="var(--color-accent-soft)" />
          <circle cx="80" cy="50" r="26" fill="var(--color-accent)" />
          <path d="m68 50 8 8 16-17" fill="none" stroke="#fff" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="36" cy="22" r="4" fill="var(--color-p2)" />
          <circle cx="128" cy="30" r="3" fill="var(--color-p3)" />
          <path d="M122 70l6 3-6 3" fill="none" stroke="var(--color-p1)" strokeWidth="2.5" strokeLinecap="round" />
        </>
      )}
      {art === 'inbox' && (
        <>
          <rect x="40" y="26" width="80" height="62" rx="10" fill="var(--color-accent-soft)" />
          <path d="M40 62h22l6 10h24l6-10h22" fill="none" stroke="var(--color-accent)" strokeWidth="4" strokeLinejoin="round" />
          <rect x="60" y="12" width="40" height="30" rx="5" fill="var(--color-surface)" stroke="var(--color-border)" strokeWidth="2" />
          <path d="M68 22h24M68 30h16" stroke="var(--color-text-subtle)" strokeWidth="3" strokeLinecap="round" />
        </>
      )}
      {art === 'calendar' && (
        <>
          <rect x="42" y="18" width="76" height="70" rx="10" fill="var(--color-accent-soft)" />
          <rect x="42" y="18" width="76" height="18" rx="9" fill="var(--color-accent)" />
          <circle cx="62" cy="54" r="5" fill="var(--color-accent)" />
          <circle cx="80" cy="54" r="5" fill="var(--color-border)" />
          <circle cx="98" cy="54" r="5" fill="var(--color-border)" />
          <circle cx="62" cy="72" r="5" fill="var(--color-border)" />
          <circle cx="80" cy="72" r="5" fill="var(--color-p2)" />
        </>
      )}
      {art === 'search' && (
        <>
          <circle cx="72" cy="50" r="28" fill="var(--color-accent-soft)" stroke="var(--color-accent)" strokeWidth="6" />
          <path d="m93 71 20 20" stroke="var(--color-accent)" strokeWidth="9" strokeLinecap="round" />
        </>
      )}
      {art === 'project' && (
        <>
          <rect x="34" y="24" width="92" height="64" rx="10" fill="var(--color-accent-soft)" />
          <circle cx="52" cy="44" r="6" fill="none" stroke="var(--color-accent)" strokeWidth="3" />
          <path d="M66 44h44" stroke="var(--color-accent)" strokeWidth="4" strokeLinecap="round" />
          <circle cx="52" cy="66" r="6" fill="none" stroke="var(--color-text-subtle)" strokeWidth="3" />
          <path d="M66 66h30" stroke="var(--color-text-subtle)" strokeWidth="4" strokeLinecap="round" />
        </>
      )}
    </svg>
  )
}
