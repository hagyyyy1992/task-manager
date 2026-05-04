export interface ForgotPasswordInput {
  email: string
}

export interface ForgotPasswordUseCase {
  execute(input: ForgotPasswordInput): Promise<import('./output-port.js').ForgotPasswordOutput>
}
