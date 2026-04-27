export interface ReorderCategoriesInput {
  userId: string
  ids: unknown
}

export interface ReorderCategoriesUseCase {
  execute(
    input: ReorderCategoriesInput,
  ): Promise<import('./output-port.js').ReorderCategoriesOutput>
}
