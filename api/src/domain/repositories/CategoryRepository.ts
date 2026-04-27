import type { Category, CategoryWithCount } from '../entities/Category.js'

export interface CategoryRepository {
  listWithCounts(userId: string): Promise<CategoryWithCount[]>
  list(userId: string): Promise<Category[]>
  create(userId: string, name: string, sortOrder?: number): Promise<Category>
  update(
    id: string,
    updates: { name?: string; sortOrder?: number },
    userId: string,
  ): Promise<Category | null>
  delete(id: string, userId: string): Promise<boolean>
  reorder(userId: string, orderedIds: string[]): Promise<Category[]>
  seedDefaults(userId: string): Promise<void>
}
