export interface ListTasksUseCase {
  execute(userId: string): Promise<import('./output-port.js').ListTasksOutput>
}
