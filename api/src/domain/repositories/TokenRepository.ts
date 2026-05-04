import type { Token, TokenScope } from '../entities/Token.js'

export interface TokenRepository {
  // jti は呼び出し側で生成して渡す。TokenService.issueLongLived と同じ jti を含む JWT を発行することで紐付ける。
  // scope='reset' (issue #66) は jti を URL に載せる password reset 用の単発トークン。
  create(input: {
    id: string
    userId: string
    scope: TokenScope
    jti: string
    label: string
  }): Promise<Token>
  findByJti(jti: string): Promise<Token | null>
  // revokedAt IS NULL のレコードのみ。scope='mcp' のみ対象 (reset は UI 一覧に出さない)
  listActiveByUser(userId: string): Promise<Token[]>
  // 戻り値は revoke 成功フラグ。指定 id が他ユーザー所有 / 既に revoke 済み / 不在の場合は false
  revoke(id: string, userId: string): Promise<boolean>
  // jti 直指定の revoke。
  // reset token → userId なし (scope:'reset' フィルタで保護 — issue #66)
  // session logout → userId あり (userId フィルタで保護 — issue #60)
  revokeByJti(jti: string, userId?: string): Promise<boolean>
  // 指定ユーザーの指定 scope のアクティブトークンを一括 revoke (issue #60)
  revokeAllByUserAndScope(userId: string, scope: TokenScope): Promise<number>
  touchLastUsed(jti: string, at: Date): Promise<void>
}
