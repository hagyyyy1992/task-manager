export interface RevokeAllSessionsInput {
  userId: string
}

export interface RevokeAllSessionsOutput {
  ok: true
  revokedCount: number
}

export interface RevokeAllSessionsUseCase {
  execute(input: RevokeAllSessionsInput): Promise<RevokeAllSessionsOutput>
}
