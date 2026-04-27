import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import type { CreateCategoryInput, CreateCategoryUseCase } from './input-port.js'
import type { CreateCategoryOutput } from './output-port.js'

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export class CreateCategoryInteractor implements CreateCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: CreateCategoryInput): Promise<CreateCategoryOutput> {
    const trimmed = input.name?.trim()
    if (!trimmed) return { ok: false, reason: 'invalid_input', message: 'name is required' }
    if (input.sortOrder !== undefined && !isValidSortOrder(input.sortOrder)) {
      return { ok: false, reason: 'invalid_input', message: 'invalid sortOrder' }
    }
    const category = await this.categories.create(input.userId, trimmed, input.sortOrder)
    return { ok: true, category }
  }
}
