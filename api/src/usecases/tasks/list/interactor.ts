import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { ListTasksUseCase } from './input-port.js'
import type { ListTasksOutput } from './output-port.js'

export class ListTasksInteractor implements ListTasksUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(userId: string): Promise<ListTasksOutput> {
    return this.tasks.list({ userId })
  }
}
