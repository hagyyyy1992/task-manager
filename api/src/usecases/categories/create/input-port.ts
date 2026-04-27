export interface CreateCategoryInput {
  userId: string
  name: string
  sortOrder?: number
}

export interface CreateCategoryUseCase {
  execute(input: CreateCategoryInput): Promise<import('./output-port.js').CreateCategoryOutput>
}
