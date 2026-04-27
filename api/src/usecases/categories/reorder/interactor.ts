import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import { CategoryReorderError } from '../../../domain/exceptions/CategoryReorderError.js'
import type { ReorderCategoriesInput, ReorderCategoriesUseCase } from './input-port.js'
import type { ReorderCategoriesOutput } from './output-port.js'

const MAX_IDS = 200

export class ReorderCategoriesInteractor implements ReorderCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  async execute(input: ReorderCategoriesInput): Promise<ReorderCategoriesOutput> {
    if (!Array.isArray(input.ids) || !input.ids.every((x) => typeof x === 'string')) {
      return { ok: false, reason: 'invalid_input', message: 'ids must be string[]' }
    }
    if (input.ids.length > MAX_IDS) {
      return { ok: false, reason: 'invalid_input', message: `ids exceeds the limit (${MAX_IDS})` }
    }
    try {
      const categories = await this.categories.reorder(input.userId, input.ids as string[])
      return { ok: true, categories }
    } catch (e: unknown) {
      if (e instanceof CategoryReorderError) {
        return { ok: false, reason: 'invalid_input', message: e.message }
      }
      throw e
    }
  }
}
