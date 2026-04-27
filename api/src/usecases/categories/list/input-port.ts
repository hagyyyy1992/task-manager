export interface ListCategoriesUseCase {
  execute(userId: string): Promise<import('./output-port.js').ListCategoriesOutput>
}
