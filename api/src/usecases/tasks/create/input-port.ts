import type { TaskCreateDto } from '../validators.js'

export interface CreateTaskInput {
  userId: string
  task: TaskCreateDto
}

export interface CreateTaskUseCase {
  execute(input: {
    userId: string
    task: unknown
  }): Promise<import('./output-port.js').CreateTaskOutput>
}
