export interface DeleteCategoryInput {
  userId: string
  id: string
}

export interface DeleteCategoryUseCase {
  execute(input: DeleteCategoryInput): Promise<import('./output-port.js').DeleteCategoryOutput>
}
