import type { Task } from '../../../domain/entities/Task.js'

export interface ListTasksOutput {
  items: Task[]
  // 次ページ取得用 opaque cursor。次が無ければ null
  nextCursor: string | null
}
