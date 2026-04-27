import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { DeleteTaskInput, DeleteTaskUseCase } from './input-port.js'
import type { DeleteTaskOutput } from './output-port.js'

export class DeleteTaskInteractor implements DeleteTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: DeleteTaskInput): Promise<DeleteTaskOutput> {
    const task = await this.tasks.delete(input.id, input.userId)
    if (!task) return { ok: false, reason: 'not_found' }
    return { ok: true, task }
  }
}
