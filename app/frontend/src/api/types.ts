export const COLORS = [
  'red',
  'orange',
  'yellow',
  'olive',
  'green',
  'teal',
  'sky',
  'blue',
  'indigo',
  'violet',
  'magenta',
  'grey',
] as const

export type Color = (typeof COLORS)[number]

/** 1 = highest (P1) … 4 = normal (P4), as in Todoist. */
export type Priority = 1 | 2 | 3 | 4

export interface LabelBrief {
  id: number
  name: string
  color: Color
}

export interface Label extends LabelBrief {
  created_at: string
  open_count: number
}

export interface Project {
  id: number
  name: string
  color: Color
  is_inbox: boolean
  position: number
  created_at: string
  open_count: number
}

export interface Task {
  id: number
  project_id: number
  parent_id: number | null
  title: string
  description: string
  priority: Priority
  /** ISO date `YYYY-MM-DD` (no time). */
  due_date: string | null
  done: boolean
  completed_at: string | null
  position: number
  created_at: string
  updated_at: string
  labels: LabelBrief[]
  subtask_count: number
  subtask_done_count: number
}

export interface TaskCreate {
  title: string
  description?: string
  priority?: Priority
  due_date?: string | null
  project_id?: number
  parent_id?: number
  label_ids?: number[]
}

export type TaskUpdate = Partial<
  Pick<Task, 'title' | 'description' | 'priority' | 'due_date' | 'done' | 'project_id' | 'position'>
> & { label_ids?: number[] }

export interface TaskQuery {
  project_id?: number
  label_id?: number
  done?: boolean
  due_from?: string
  due_to?: string
  no_due?: boolean
  q?: string
  parent_id?: number
  top_level?: boolean
  limit?: number
}

export const TITLE_MAX_LENGTH = 500
export const DESCRIPTION_MAX_LENGTH = 5000
