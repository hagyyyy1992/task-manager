import type { TaskRepository } from '../../../domain/repositories/TaskRepository.js'
import type { CreateTaskInput, CreateTaskUseCase } from './input-port.js'
import type { CreateTaskOutput } from './output-port.js'

export class CreateTaskInteractor implements CreateTaskUseCase {
  constructor(private readonly tasks: TaskRepository) {}

  async execute(input: CreateTaskInput): Promise<CreateTaskOutput> {
    await this.tasks.create(input.task, input.userId)
    return input.task
  }
}
