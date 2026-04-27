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

  // MCP 等の長期利用クライアント向け（1年）。UI 経由の通常ログインでは使わない。
  // jti は呼び出し側で生成して渡し、DB の Token テーブルと突合可能にする (issue #37)。
  async issueLongLived(userId: string, jti: string): Promise<string> {
    return new SignJWT({ sub: userId, scope: 'mcp' satisfies TokenScope })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .setJti(jti)
      .sign(this.secret)
  }

  async verify(token: string): Promise<VerifiedToken | null> {
    try {
      // alg を HS256 に固定。明示しないと alg 取り違え攻撃 (RS/ES や none) のリスクが残る
      const { payload } = await jwtVerify(token, this.secret, { algorithms: ['HS256'] })
      const userId = payload.sub
      if (typeof userId !== 'string') return null
      // 旧トークン（scope claim 無し）は session として扱う
      const rawScope = payload.scope
      const scope: TokenScope = rawScope === 'mcp' ? 'mcp' : 'session'
      // iat 欠落は設計上ありえない (issue/issueLongLived は必ず setIssuedAt を呼ぶ) が、
      // 念のため 0 を返すと middleware 側で「変更日時より昔」と判定 → 失効させる
      const issuedAt = typeof payload.iat === 'number' ? payload.iat : 0
      // jti は issue #37 以前の旧 mcp トークンには付いていないため null フォールバック。
      // middleware 側で「mcp かつ jti=null」を許容するか拒否するかを判定する。
      const jti = typeof payload.jti === 'string' ? payload.jti : null
      return { userId, scope, issuedAt, jti }
    } catch {
      return null
    }
  }
}
