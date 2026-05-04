// 長期 JWT (issueLongLived = MCP 連携) を個別に失効するためのレコード (issue #37)
// jti は JWT の jti claim と 1:1 対応し、verify 時の DB 突合キーになる。
// label はユーザーがトークンの用途を識別するための任意ラベル (例: "macbook claude code")。
//
// scope='reset' はパスワードリセット用の単発トークン (issue #66)。
// expiresAt 列を持たないため createdAt + RESET_TOKEN_TTL_MS で期限判定する。
// jti は URL-safe random (base64url 32 byte) で password reset link に載せる。
// 使用後は revokedAt を設定して single-use 化する。
//
// scope='session' は UI ログインの短期 (7d) セッション (issue #60)。
// jti を JWT に埋め込み、Token テーブルで失効管理する。
// logout / revoke-all-sessions で revokedAt を打つことで即時失効できる。
export type TokenScope = 'mcp' | 'reset' | 'session'

export interface Token {
  id: string
  userId: string
  scope: TokenScope
  jti: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
