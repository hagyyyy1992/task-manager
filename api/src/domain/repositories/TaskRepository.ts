import type { Task, TaskUpdate } from '../entities/Task.js'

export interface TaskListFilter {
  userId: string
  status?: string
  category?: string
  // cursor pagination (issue #40)
  // - cursor: 直前の応答 nextCursor をそのまま渡す (opaque、base64url(id))
  // - limit: 取得上限。未指定時は repo 側のデフォルト (= 100)
  cursor?: string
  limit?: number
}

export interface TaskListPage {
  items: Task[]
  // 次ページが無ければ null
  nextCursor: string | null
}

export interface TaskRepository {
  list(filter: TaskListFilter): Promise<TaskListPage>
  create(task: Task, userId: string): Promise<void>
  update(id: string, updates: TaskUpdate, userId: string): Promise<Task | null>
  delete(id: string, userId: string): Promise<Task | null>
}
