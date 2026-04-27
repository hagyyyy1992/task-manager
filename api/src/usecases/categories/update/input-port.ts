export interface UpdateCategoryInput {
  userId: string
  id: string
  name?: string
  sortOrder?: number
}

export interface UpdateCategoryUseCase {
  execute(input: UpdateCategoryInput): Promise<import('./output-port.js').UpdateCategoryOutput>
}
