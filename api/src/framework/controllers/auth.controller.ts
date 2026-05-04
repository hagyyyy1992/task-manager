import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.middleware.ts'
import type { Container } from '../di/container.js'
import { createAuthMiddleware } from '../middleware/auth.middleware.js'

export function createAuthController(container: Container) {
  const app = new Hono<AuthEnv>()

  // public
  app.post('/register', async (c) => {
    const body = await c.req.json<{
      email?: string
      password?: string
      name?: string
      termsAgreed?: boolean
    }>()
    const result = await container.register.execute({
      email: body.email ?? '',
      password: body.password ?? '',
      name: body.name ?? '',
      termsAgreed: body.termsAgreed ?? false,
    })
    if (result.ok) return c.json({ user: result.user, token: result.token }, 201)
    const status = result.reason === 'disabled' ? 403 : result.reason === 'duplicate' ? 409 : 400
    return c.json({ error: result.message }, status)
  })

  app.post('/login', async (c) => {
    const body = await c.req.json<{ email?: string; password?: string }>()
    const result = await container.login.execute({
      email: body.email ?? '',
      password: body.password ?? '',
    })
    if (result.ok) return c.json({ user: result.user, token: result.token }, 200)
    const status = result.reason === 'invalid_input' ? 400 : 401
    return c.json({ error: result.message }, status)
  })

  // パスワードリセット要求 (issue #66)。
  // email 列挙対策のため、実在ユーザー有無に関わらず常に 200 を返す。
  // invalid_input (email 形式不正) のみ 400。
  app.post('/forgot-password', async (c) => {
    const body = await c.req.json<{ email?: string }>()
    const result = await container.forgotPassword.execute({ email: body.email ?? '' })
    if (result.ok) return c.json({ message: 'reset email sent if account exists' }, 200)
    return c.json({ error: result.message }, 400)
  })

  // パスワードリセット実行 (issue #66)。
  // 成功時は passwordChangedAt が更新され既存全 session JWT が失効する (issue #36 と同じ仕組み)。
  app.post('/reset-password', async (c) => {
    const body = await c.req.json<{ token?: string; newPassword?: string }>()
    const result = await container.resetPassword.execute({
      token: body.token ?? '',
      newPassword: body.newPassword ?? '',
    })
    if (result.ok) return c.json({ message: 'password updated' }, 200)
    const status = result.reason === 'invalid_input' ? 400 : 401
    return c.json({ error: result.message }, status)
  })

  // protected
  const protectedRoutes = new Hono<AuthEnv>()
  protectedRoutes.use(
    '*',
    createAuthMiddleware(container.tokens, container.users, container.tokenRepo),
  )

  protectedRoutes.get('/me', async (c) => {
    const result = await container.me.execute(c.get('userId'))
    if (result.ok) return c.json(result.user, 200)
    return c.json({ error: 'user not found' }, 404)
  })

  protectedRoutes.patch('/password', async (c) => {
    const body = await c.req.json<{ currentPassword?: string; newPassword?: string }>()
    const result = await container.changePassword.execute({
      userId: c.get('userId'),
      currentPassword: body.currentPassword ?? '',
      newPassword: body.newPassword ?? '',
    })
    if (result.ok) return c.json({ message: 'password updated' }, 200)
    const status =
      result.reason === 'invalid_input'
        ? 400
        : result.reason === 'unauthorized' || result.reason === 'wrong_password'
          ? 401
          : result.reason === 'demo_forbidden'
            ? 403
            : 404
    return c.json({ error: result.message }, status)
  })

  protectedRoutes.delete('/account', async (c) => {
    // DELETE は body オプション (json-body middleware は body 不在を素通り)。
    // body 無しなら currentPassword 未指定として interactor 側の 400 invalid_input に流す。
    let body: { currentPassword?: string } = {}
    try {
      body = await c.req.json<{ currentPassword?: string }>()
    } catch {
      // 空 body / 壊れた JSON は middleware で 400 済み or body 不在で空オブジェクト扱い
    }
    const result = await container.deleteAccount.execute({
      userId: c.get('userId'),
      currentPassword: body.currentPassword ?? '',
    })
    if (result.ok) return c.json({ message: 'account deleted' }, 200)
    const status =
      result.reason === 'invalid_input'
        ? 400
        : result.reason === 'wrong_password'
          ? 401
          : result.reason === 'demo_forbidden'
            ? 403
            : 404
    return c.json({ error: result.message ?? 'user not found' }, status)
  })

  // MCP トークン管理 (issue #37)
  protectedRoutes.get('/mcp-tokens', async (c) => {
    const result = await container.listMcpTokens.execute(c.get('userId'))
    // jti と userId は内部識別子なのでレスポンスに含めない
    const tokens = result.tokens.map((t) => ({
      id: t.id,
      label: t.label,
      createdAt: t.createdAt,
      lastUsedAt: t.lastUsedAt,
    }))
    return c.json({ tokens }, 200)
  })

  protectedRoutes.post('/mcp-tokens', async (c) => {
    let body: { label?: string } = {}
    try {
      body = await c.req.json<{ label?: string }>()
    } catch {
      // body 不在 / 不正 JSON は middleware で 400 済み or 空オブジェクト扱い
    }
    const result = await container.issueMcpToken.execute({
      userId: c.get('userId'),
      label: body.label,
    })
    if (result.ok) return c.json({ token: result.token, tokenId: result.tokenId }, 201)
    const status = result.reason === 'demo_forbidden' ? 403 : 400
    return c.json({ error: result.message }, status)
  })

  // session logout — 現在のセッショントークンを失効 (issue #60)
  protectedRoutes.post('/logout', async (c) => {
    const jti = c.get('jti')
    if (!jti) return c.json({ error: 'jti required for session logout' }, 400)
    const result = await container.logout.execute({ userId: c.get('userId'), jti })
    if (result.ok) return c.json({ message: 'logged out' }, 200)
    // 既に revoke 済みのセッションも 200 で返す (冪等設計: 二重logout も安全)
    return c.json({ message: 'already logged out' }, 200)
  })

  // 全セッション失効 (issue #60)
  protectedRoutes.delete('/sessions', async (c) => {
    const result = await container.revokeAllSessions.execute({ userId: c.get('userId') })
    return c.json({ message: 'all sessions revoked', revokedCount: result.revokedCount }, 200)
  })

  protectedRoutes.delete('/mcp-tokens/:id', async (c) => {
    const result = await container.revokeMcpToken.execute({
      userId: c.get('userId'),
      tokenId: c.req.param('id'),
    })
    if (result.ok) return c.json({ message: 'token revoked' }, 200)
    return c.json({ error: 'token not found' }, 404)
  })

  app.route('/', protectedRoutes)
  return app
}
