export interface DeleteTaskInput {
  userId: string
  id: string
}

export interface DeleteTaskUseCase {
  execute(input: DeleteTaskInput): Promise<import('./output-port.js').DeleteTaskOutput>
}
