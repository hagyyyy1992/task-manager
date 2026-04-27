import type { MiddlewareHandler } from 'hono'
import type { TokenScope, TokenService } from '../../domain/services/TokenService.js'

export type AuthEnv = { Variables: { userId: string; scope: TokenScope } }

export interface AuthMiddlewareOptions {
  // 許可する scope。省略時は session のみ（=UI 通常ログイン）
  allowedScopes?: TokenScope[]
}

export function createAuthMiddleware(
  tokens: TokenService,
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
    c.set('userId', verified.userId)
    c.set('scope', verified.scope)
    await next()
  }
}
