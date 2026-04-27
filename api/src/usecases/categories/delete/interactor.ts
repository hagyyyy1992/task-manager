import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import { CategoryProtectedError } from '../../../domain/exceptions/CategoryProtectedError.js'
import type { DeleteCategoryInput, DeleteCategoryUseCase } from './input-port.js'
import type { DeleteCategoryOutput } from './output-port.js'

export class DeleteCategoryInteractor implements DeleteCategoryUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: DeleteCategoryInput): Promise<DeleteCategoryOutput> {
    try {
      const ok = await this.categories.delete(input.id, input.userId)
      if (!ok) return { ok: false, reason: 'not_found', message: 'not found' }
      return { ok: true }
    } catch (e: unknown) {
      if (e instanceof CategoryProtectedError) {
        return { ok: false, reason: 'protected', message: e.message }
      }
      throw e
    }
  }
}
