import type { Task, TaskUpdate } from '../entities/Task.js'

export interface TaskListFilter {
  userId: string
  status?: string
  category?: string
}

export interface TaskRepository {
  list(filter: TaskListFilter): Promise<Task[]>
  create(task: Task, userId: string): Promise<void>
  update(id: string, updates: TaskUpdate, userId: string): Promise<Task | null>
  delete(id: string, userId: string): Promise<Task | null>
}
