import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import { CategoryProtectedError } from '../../../domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '../../../domain/exceptions/CategoryDuplicateError.js'
import type { UpdateCategoryInput, UpdateCategoryUseCase } from './input-port.js'
import type { UpdateCategoryOutput } from './output-port.js'
import { CATEGORY_NAME_MAX } from '../validators.js'
import { CATEGORY_DUPLICATE_MESSAGE, isPrismaUniqueViolationOnName } from '../duplicate-error.js'

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

export class UpdateCategoryInteractor implements UpdateCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: UpdateCategoryInput): Promise<UpdateCategoryOutput> {
    const trimmedName = input.name?.trim()
    if (input.name !== undefined && !trimmedName) {
      return { ok: false, reason: 'invalid_input', message: 'name is required' }
    }
    if (trimmedName !== undefined && trimmedName.length > CATEGORY_NAME_MAX) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: `name must be at most ${CATEGORY_NAME_MAX} characters`,
      }
    }
    if (trimmedName !== undefined && /[\r\n\0]/.test(trimmedName)) {
      return { ok: false, reason: 'invalid_input', message: 'name contains invalid characters' }
    }
    if (input.sortOrder !== undefined && !isValidSortOrder(input.sortOrder)) {
      return { ok: false, reason: 'invalid_input', message: 'invalid sortOrder' }
    }

    try {
      const updated = await this.categories.update(
        input.id,
        { name: trimmedName, sortOrder: input.sortOrder },
        input.userId,
      )
      if (!updated) return { ok: false, reason: 'not_found', message: 'not found' }
      return { ok: true, category: updated }
    } catch (e: unknown) {
      if (e instanceof CategoryProtectedError) {
        return { ok: false, reason: 'protected', message: e.message }
      }
      if (e instanceof CategoryDuplicateError || isPrismaUniqueViolationOnName(e)) {
        return { ok: false, reason: 'duplicate', message: CATEGORY_DUPLICATE_MESSAGE }
      }
      throw e
    }
  }
}
