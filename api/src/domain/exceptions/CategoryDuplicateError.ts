export class CategoryDuplicateError extends Error {
  constructor(message = '同じ名前のカテゴリが既に存在します') {
    super(message)
    this.name = 'CategoryDuplicateError'
  }
}
