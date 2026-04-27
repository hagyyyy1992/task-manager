import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import type { ListCategoriesUseCase } from './input-port.js'
import type { ListCategoriesOutput } from './output-port.js'

export class ListCategoriesInteractor implements ListCategoriesUseCase {
  constructor(private readonly categories: CategoryRepository) {}

  execute(userId: string): Promise<ListCategoriesOutput> {
    return this.categories.listWithCounts(userId)
  }
}
