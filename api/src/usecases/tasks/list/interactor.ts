import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { ListTasksInput, ListTasksUseCase } from './input-port.js'
import type { ListTasksOutput } from './output-port.js'

export class ListTasksInteractor implements ListTasksUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  execute(input: ListTasksInput): Promise<ListTasksOutput> {
    return this.tasks.list({
      userId: input.userId,
      cursor: input.cursor,
      limit: input.limit,
    })
  }
}
