export interface RegisterInput {
  email: string
  password: string
  name: string
  termsAgreed: boolean
}

export interface RegisterUseCase {
  execute(input: RegisterInput): Promise<import('./output-port.js').RegisterOutput>
}
