import type { Token } from '../entities/Token.js'

export interface TokenRepository {
  // jti は呼び出し側で生成して渡す。TokenService.issueLongLived と同じ jti を含む JWT を発行することで紐付ける。
  create(input: {
    id: string
    userId: string
    scope: 'mcp'
    jti: string
    label: string
  }): Promise<Token>
  findByJti(jti: string): Promise<Token | null>
  // revokedAt IS NULL のレコードのみ
  listActiveByUser(userId: string): Promise<Token[]>
  // 戻り値は revoke 成功フラグ。指定 id が他ユーザー所有 / 既に revoke 済み / 不在の場合は false
  revoke(id: string, userId: string): Promise<boolean>
  touchLastUsed(jti: string, at: Date): Promise<void>
}
