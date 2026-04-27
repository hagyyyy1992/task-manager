export interface ChangePasswordInput {
  userId: string
  currentPassword: string
  newPassword: string
}

export interface ChangePasswordUseCase {
  execute(input: ChangePasswordInput): Promise<import('./output-port.js').ChangePasswordOutput>
}
