export interface DeleteAccountInput {
  userId: string
  currentPassword: string
}

export interface DeleteAccountUseCase {
  execute(input: DeleteAccountInput): Promise<import('./output-port.js').DeleteAccountOutput>
}
