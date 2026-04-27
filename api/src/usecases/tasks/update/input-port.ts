import type { TaskUpdate } from '../../../domain/entities/Task.js'

export interface UpdateTaskInput {
  userId: string
  id: string
  updates: TaskUpdate
}

export interface UpdateTaskUseCase {
  execute(input: UpdateTaskInput): Promise<import('./output-port.js').UpdateTaskOutput>
}
