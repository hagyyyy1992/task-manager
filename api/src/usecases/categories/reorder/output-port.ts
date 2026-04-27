import type { Category } from '../../../domain/entities/Category.js'

export type ReorderCategoriesOutput =
  | { ok: true; categories: Category[] }
  | { ok: false; reason: 'invalid_input'; message: string }
