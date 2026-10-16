import { createContext, useContext } from 'react'
import type { Label, Priority, Project } from '../api/types'

export interface QuickAddDefaults {
  projectId?: number
  dueDate?: string
  /** "HH:MM" */
  dueTime?: string
  duration?: number
  priority?: Priority
  labelIds?: number[]
  parentId?: number
}

/** App-wide actions provided by AppShell (dialogs live there). */
export interface UIActions {
  openQuickAdd: (defaults?: QuickAddDefaults) => void
  openTask: (id: number) => void
  editProject: (project?: Project) => void
  editLabel: (label?: Label) => void
  openShortcuts: () => void
}

const noop = () => {}

export const UIContext = createContext<UIActions>({
  openQuickAdd: noop,
  openTask: noop,
  editProject: noop,
  editLabel: noop,
  openShortcuts: noop,
})

export const useUI = () => useContext(UIContext)
