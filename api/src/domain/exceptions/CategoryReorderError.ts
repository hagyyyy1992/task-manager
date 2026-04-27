export class CategoryReorderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CategoryReorderError'
  }
}
