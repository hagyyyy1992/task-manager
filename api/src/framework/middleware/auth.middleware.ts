import type { MiddlewareHandler } from 'hono'
import type { TokenScope, TokenService } from '../../domain/services/TokenService.js'
import type { UserRepository } from '../../domain/repositories/UserRepository.js'
import type { TokenRepository } from '../../domain/repositories/TokenRepository.js'

export type AuthEnv = { Variables: { userId: string; scope: TokenScope; jti: string | null } }

export interface AuthMiddlewareOptions {
  // 許可する scope。省略時は session のみ（=UI 通常ログイン）
  allowedScopes?: TokenScope[]
}

// session scope の lastUsedAt 更新を間引く間隔 (issue #81)。
// 5 分以内のリクエストでは DB write を skip する。監査用途では分単位の精度で十分で、
// UI 通常トラフィックの DB 負荷を大きく削減できる。
const SESSION_TOUCH_INTERVAL_MS = 5 * 60 * 1000

export function createAuthMiddleware(
  tokens: TokenService,
  users: UserRepository,
  tokenRepo: TokenRepository,
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
    // mcp / session scope は Token テーブルと突き合わせて個別失効を検査する (issue #37, #60)。
    if (verified.scope === 'mcp' || verified.scope === 'session') {
      if (!verified.jti) {
        // jti が無い旧トークンは revoke 不能なので拒否し再発行を強制する
        return c.json(
          {
            error:
              'token without jti is no longer accepted; please re-login or re-issue from the account page',
          },
          401,
        )
      }
      const tokenRow = await tokenRepo.findByJti(verified.jti)
      if (
        !tokenRow ||
        tokenRow.userId !== verified.userId ||
        tokenRow.scope !== verified.scope ||
        tokenRow.revokedAt !== null
      ) {
        return c.json({ error: 'invalid or expired token' }, 401)
      }
      // lastUsedAt は監査用。失敗しても認証フローは止めない (fire-and-forget)。
      // session scope は通常 UI トラフィックで全 API 呼び出しごとに DB write が発生するため、
      // 最終更新から SESSION_TOUCH_INTERVAL_MS 以内なら skip して書き込みを間引く (issue #81)。
      // mcp は監査用途として重要かつ頻度が低いので毎回更新する。
      const now = new Date()
      const shouldTouch =
        verified.scope === 'mcp' ||
        tokenRow.lastUsedAt === null ||
        now.getTime() - new Date(tokenRow.lastUsedAt).getTime() >= SESSION_TOUCH_INTERVAL_MS
      if (shouldTouch) {
        tokenRepo.touchLastUsed(verified.jti, now).catch((err) => {
          console.warn('auth.touchLastUsed.failed', { err })
        })
      }
    }
    c.set('userId', verified.userId)
    c.set('scope', verified.scope)
    c.set('jti', verified.jti)
    await next()
  }
}
