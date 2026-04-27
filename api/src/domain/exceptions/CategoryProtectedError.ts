import { FALLBACK_CATEGORY_NAME } from '../entities/Category.js'

export class CategoryProtectedError extends Error {
  constructor(message = `「${FALLBACK_CATEGORY_NAME}」カテゴリは削除できません`) {
    super(message)
    this.name = 'CategoryProtectedError'
  }
}
