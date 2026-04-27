import type { Category } from '../../../domain/entities/Category.js'

export type UpdateCategoryOutput =
  | { ok: true; category: Category }
  | {
      ok: false
      reason: 'invalid_input' | 'not_found' | 'protected' | 'duplicate'
      message: string
    }
