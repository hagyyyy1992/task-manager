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
      // iat (秒) を ms に変換して比較。境界値 iat*1000 == passwordChangedAt は受理（同瞬間に発行）
      if (verified.issuedAt * 1000 < new Date(user.passwordChangedAt).getTime()) {
        return c.json({ error: 'invalid or expired token' }, 401)
      }
    }
    c.set('userId', verified.userId)
    c.set('scope', verified.scope)
    await next()
  }
}
