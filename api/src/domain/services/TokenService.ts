export type TokenScope = 'session' | 'mcp'

export interface VerifiedToken {
  userId: string
  scope: TokenScope
  // JWT iat (issued-at, epoch 秒)。auth middleware が User.passwordChangedAt と比較して失効判定に使う (issue #36)
  issuedAt: number
}

export interface TokenService {
  issue(userId: string): Promise<string>
  issueLongLived(userId: string): Promise<string>
  verify(token: string): Promise<VerifiedToken | null>
}
