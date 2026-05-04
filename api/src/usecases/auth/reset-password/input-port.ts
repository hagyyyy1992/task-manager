export interface ResetPasswordInput {
  token: string
  newPassword: string
}

export interface ResetPasswordUseCase {
  execute(input: ResetPasswordInput): Promise<import('./output-port.js').ResetPasswordOutput>
}
