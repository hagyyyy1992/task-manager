import type { Task } from '../../../domain/entities/Task.js'

export interface CreateTaskInput {
  userId: string
  task: Task
}

export interface CreateTaskUseCase {
  execute(input: CreateTaskInput): Promise<import('./output-port.js').CreateTaskOutput>
}
