export interface LoginInput {
  email: string
  password: string
}

export interface LoginUseCase {
  execute(input: LoginInput): Promise<import('./output-port.js').LoginOutput>
}
