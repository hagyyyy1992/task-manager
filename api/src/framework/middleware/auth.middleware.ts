import type { MiddlewareHandler } from 'hono'
import type { TokenScope, TokenService } from '../../domain/services/TokenService.js'
import type { UserRepository } from '../../domain/repositories/UserRepository.js'

export type AuthEnv = { Variables: { userId: string; scope: TokenScope } }

export interface AuthMiddlewareOptions {
  // 許可する scope。省略時は session のみ（=UI 通常ログイン）
  allowedScopes?: TokenScope[]
}

export function createAuthMiddleware(
  tokens: TokenService,
  users: UserRepository,
  options: AuthMiddlewareOptions = {},
): MiddlewareHandler<AuthEnv> {
  const allowedScopes: TokenScope[] = options.allowedScopes ?? ['session']
  return async (c, next) => {
    const auth = c.req.header('authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return c.json({ error: 'authentication required' }, 401)
    const verified = await tokens.verify(token)
    if (!verified) return c.json({ error: 'invalid or expired token' }, 401)
    if (!allowedScopes.includes(verified.scope)) {
      return c.json({ error: 'token scope not allowed for this endpoint' }, 403)
    }
    // 削除済みユーザー & パスワード変更後トークンを 1 DB 呼び出しでまとめて拒否 (issue #36)
    const user = await users.findById(verified.userId)
    if (!user) return c.json({ error: 'invalid or expired token' }, 401)
    if (user.passwordChangedAt !== null) {
      // JWT iat は秒精度 (Math.floor(ms/1000)) なので、passwordChangedAt も
      // 秒に切り捨てて比較する。ms 同士で比較すると、同一秒内かつ ms 単位で
      // パスワード変更より「後」に発行された新トークンを誤って失効扱いに
      // してしまう (例: pwd=10:00:00.900 → 直後 10:00:00.950 に発行された
      // 新トークンは iat=10:00:00 で iat*1000=10:00:00.000 < 10:00:00.900
      // となり 401 になる)。
      // さらに Lambda 間 / DB 間の clock skew を吸収するため、5 秒の猶予を
      // 与える。これにより「変更直前 5 秒以内に発行された旧トークン」は
      // 受理されてしまうが、被害窓口は実用上無視できる範囲。
      const CLOCK_SKEW_GRACE_SEC = 5
      const passwordChangedAtSec = Math.floor(new Date(user.passwordChangedAt).getTime() / 1000)
      if (verified.issuedAt + CLOCK_SKEW_GRACE_SEC < passwordChangedAtSec) {
        return c.json({ error: 'invalid or expired token' }, 401)
      }
    }
    c.set('userId', verified.userId)
    c.set('scope', verified.scope)
    await next()
  }
}
