export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export interface Category {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: string
  taskCount?: number
}

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
