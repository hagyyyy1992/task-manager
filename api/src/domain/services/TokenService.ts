export type TokenScope = 'session' | 'mcp'

export interface VerifiedToken {
  userId: string
  scope: TokenScope
  // JWT iat (issued-at, epoch 秒)。auth middleware が User.passwordChangedAt と比較して失効判定に使う (issue #36)
  issuedAt: number
  // mcp scope のみ jti claim を持つ。auth middleware が DB の Token.revokedAt と突き合わせる (issue #37)。
  // PR #35 以前に発行された旧 mcp トークンには jti が無く、その場合は null。
  jti: string | null
}

export interface TokenService {
  issue(userId: string): Promise<string>
  // jti を呼び出し側で生成して渡す (DB の Token テーブルと同じ jti を JWT claim に埋め込むため)。
  // session トークン側は短期 (7d) なので個別失効が必要なく、jti は不要。
  issueLongLived(userId: string, jti: string): Promise<string>
  verify(token: string): Promise<VerifiedToken | null>
}
