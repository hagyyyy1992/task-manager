export interface ListTasksInput {
  userId: string
  cursor?: string
  limit?: number
}

export interface ListTasksUseCase {
  execute(input: ListTasksInput): Promise<import('./output-port.js').ListTasksOutput>
}
