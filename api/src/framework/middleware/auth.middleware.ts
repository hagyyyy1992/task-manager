import type { MiddlewareHandler } from 'hono'
import type { TokenService } from '../../domain/services/TokenService.js'

export type AuthEnv = { Variables: { userId: string } }

export function createAuthMiddleware(tokens: TokenService): MiddlewareHandler<AuthEnv> {
  return async (c, next) => {
    const auth = c.req.header('authorization') || c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) return c.json({ error: 'authentication required' }, 401)
    const userId = await tokens.verify(token)
    if (!userId) return c.json({ error: 'invalid or expired token' }, 401)
    c.set('userId', userId)
    await next()
  }
}
