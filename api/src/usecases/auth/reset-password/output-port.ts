export type ResetPasswordOutput =
  | { ok: true }
  | {
      ok: false
      // invalid_input: token / newPassword 形式不正
      // invalid_token: token 不在 / 既使用 / 期限切れ / scope 不一致 のいずれか (詳細は応答に出さない)
      reason: 'invalid_input' | 'invalid_token'
      message: string
    }
