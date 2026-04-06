export type TaskStatus = 'todo' | 'in_progress' | 'done'
export type TaskPriority = 'high' | 'medium' | 'low'

export const CATEGORIES = [
  '決算・税務',
  '案件・営業',
  'プロダクト開発',
  '事務・手続き',
  'その他',
] as const

export type TaskCategory = (typeof CATEGORIES)[number]

export interface Task {
  id: string
  title: string
  status: TaskStatus
  priority: TaskPriority
  category: TaskCategory
  dueDate: string | null
  memo: string
  createdAt: string
  updatedAt: string
}
