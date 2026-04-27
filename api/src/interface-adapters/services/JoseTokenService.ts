import { SignJWT, jwtVerify } from 'jose'
import type { TokenService, TokenScope, VerifiedToken } from '../../domain/services/TokenService.js'

export class JoseTokenService implements TokenService {
  private readonly secret: Uint8Array

  constructor(secret: string) {
    if (!secret) throw new Error('JWT secret is required')
    this.secret = new TextEncoder().encode(secret)
  }

  async issue(userId: string): Promise<string> {
    return new SignJWT({ sub: userId, scope: 'session' satisfies TokenScope })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('7d')
      .sign(this.secret)
  }

  // MCP 等の長期利用クライアント向け（1年）。UI 経由の通常ログインでは使わない
  async issueLongLived(userId: string): Promise<string> {
    return new SignJWT({ sub: userId, scope: 'mcp' satisfies TokenScope })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .sign(this.secret)
  }

  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      const { payload } = await jwtVerify(token, this.secret)
      const userId = payload.sub
      if (typeof userId !== 'string') return null
      // 旧トークン（scope claim 無し）は session として扱う
      const rawScope = payload.scope
      const scope: TokenScope = rawScope === 'mcp' ? 'mcp' : 'session'
      return { userId, scope }
    } catch {
      return null
    }
  }
}
