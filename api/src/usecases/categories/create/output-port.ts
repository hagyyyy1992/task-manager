import type { Category } from '../../../domain/entities/Category.js'

export type CreateCategoryOutput =
  | { ok: true; category: Category }
  | { ok: false; reason: 'invalid_input'; message: string }
