import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { UpdateTaskInput, UpdateTaskUseCase } from './input-port.js'
import type { UpdateTaskOutput } from './output-port.js'

export class UpdateTaskInteractor implements UpdateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: UpdateTaskInput): Promise<UpdateTaskOutput> {
    const task = await this.tasks.update(input.id, input.updates, input.userId)
    if (!task) return { ok: false, reason: 'not_found' }
    return { ok: true, task }
  }
}
