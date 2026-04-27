export type TokenScope = 'session' | 'mcp'

export interface VerifiedToken {
  userId: string
  scope: TokenScope
}

export interface TokenService {
  issue(userId: string): Promise<string>
  issueLongLived(userId: string): Promise<string>
  verify(token: string): Promise<VerifiedToken | null>
}
