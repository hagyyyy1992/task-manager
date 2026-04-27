import { randomUUID } from 'crypto'
import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { Task } from '../../../domain/entities/Task.js'
import type { CreateTaskUseCase } from './input-port.js'
import type { CreateTaskOutput } from './output-port.js'
import { TaskCreateSchema } from '../validators.js'

export class CreateTaskInteractor implements CreateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: { userId: string; task: unknown }): Promise<CreateTaskOutput> {
    const parsed = TaskCreateSchema.safeParse(input.task)
    if (!parsed.success) {
      const message = parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ')
      return { ok: false, reason: 'invalid_input', message }
    }
    const now = new Date().toISOString()
    const task: Task = {
      id: randomUUID(),
      title: parsed.data.title,
      status: parsed.data.status,
      priority: parsed.data.priority,
      category: parsed.data.category,
      dueDate: parsed.data.dueDate,
      memo: parsed.data.memo,
      pinned: parsed.data.pinned,
      createdAt: now,
      updatedAt: now,
    }
    await this.tasks.create(task, input.userId)
    return { ok: true, task }
  }
}
