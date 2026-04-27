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

  // protected
  const protectedRoutes = new Hono<AuthEnv>()
  protectedRoutes.use('*', createAuthMiddleware(container.tokens, container.users))

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
      result.reason === 'invalid_input' ? 400 : result.reason === 'wrong_password' ? 401 : 404
    return c.json({ error: result.message ?? 'user not found' }, status)
  })

  app.route('/', protectedRoutes)
  return app
}
