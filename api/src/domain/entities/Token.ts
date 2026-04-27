// 長期 JWT (issueLongLived = MCP 連携) を個別に失効するためのレコード (issue #37)
// jti は JWT の jti claim と 1:1 対応し、verify 時の DB 突合キーになる。
// label はユーザーがトークンの用途を識別するための任意ラベル (例: "macbook claude code")。
export interface Token {
  id: string
  userId: string
  scope: 'mcp'
  jti: string
  label: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
}
