export interface UpdateTaskInput {
  userId: string
  id: string
  updates: unknown
}

export interface UpdateTaskUseCase {
  execute(input: UpdateTaskInput): Promise<import('./output-port.js').UpdateTaskOutput>
}
