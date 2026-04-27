import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import { CategoryProtectedError } from '../../../domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '../../../domain/exceptions/CategoryDuplicateError.js'
import type { UpdateCategoryInput, UpdateCategoryUseCase } from './input-port.js'
import type { UpdateCategoryOutput } from './output-port.js'

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPrismaUniqueViolationOnName(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err.code !== 'P2002') return false
  const target = err.meta?.target
  if (Array.isArray(target)) return target.includes('name')
  if (typeof target === 'string') return target.includes('name')
  // target が無いケースは安全側で true（Category の唯一の unique 制約は (userId, name)）
  return target === undefined
}

const DUPLICATE_MESSAGE = '同じ名前のカテゴリが既に存在します'

export class UpdateCategoryInteractor implements UpdateCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: UpdateCategoryInput): Promise<UpdateCategoryOutput> {
    const trimmedName = input.name?.trim()
    if (input.name !== undefined && !trimmedName) {
      return { ok: false, reason: 'invalid_input', message: 'name is required' }
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
        return { ok: false, reason: 'duplicate', message: DUPLICATE_MESSAGE }
      }
      throw e
    }
  }
}
