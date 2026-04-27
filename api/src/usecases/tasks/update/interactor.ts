import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { UpdateTaskInput, UpdateTaskUseCase } from './input-port.js'
import type { UpdateTaskOutput } from './output-port.js'
import { TaskUpdateSchema } from '../validators.js'

export class UpdateTaskInteractor implements UpdateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: UpdateTaskInput): Promise<UpdateTaskOutput> {
    const parsed = TaskUpdateSchema.safeParse(input.updates)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
      return { ok: false, reason: 'invalid_input', message }
    }
    const task = await this.tasks.update(input.id, parsed.data, input.userId)
    if (!task) return { ok: false, reason: 'not_found' }
    return { ok: true, task }
  }
}
