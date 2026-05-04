export interface LogoutInput {
  userId: string
  jti: string
}

export type LogoutOutput = { ok: true } | { ok: false; reason: 'not_found' }

export interface LogoutUseCase {
  execute(input: LogoutInput): Promise<LogoutOutput>
}
