export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  category: string
  dueDate: string | null
  memo: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

export type TaskUpdate = Partial<
  Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate' | 'category' | 'pinned'>
>
