// TokenScope の正規定義は Token.ts で行う。import してローカルで使いつつ re-export する。
import type { TokenScope } from '../entities/Token.js'
export type { TokenScope }

export interface VerifiedToken {
  userId: string
  scope: TokenScope
  // JWT iat (issued-at, epoch 秒)。auth middleware が User.passwordChangedAt と比較して失効判定に使う (issue #36)
  issuedAt: number
  // mcp / session scope は jti claim を持つ。auth middleware が DB の Token.revokedAt と突き合わせる (issue #37, #60)。
  // PR #35 以前に発行された旧 mcp トークンには jti が無く、その場合は null。
  jti: string | null
}

export interface TokenService {
  // session トークン (7d)。jti を呼び出し側で渡し、DB の Token テーブルと突合可能にする (issue #60)。
  issue(userId: string, jti: string): Promise<string>
  // MCP 等の長期利用クライアント向け (90d)。jti は DB 突合用 (issue #37)。
  issueLongLived(userId: string, jti: string): Promise<string>
  verify(token: string): Promise<VerifiedToken | null>
}
