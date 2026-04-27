import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { verifyToken } from './lib/auth.js'
import { authRoutes } from './routes/auth.js'
import { taskRoutes } from './routes/tasks.js'
import { categoryRoutes } from './routes/categories.js'

export type AppEnv = {
  Variables: { userId: string }
}

const DEFAULT_ORIGINS = ['http://localhost:5173', 'https://d3pi0juuilndgb.cloudfront.net']

function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS
  if (!env) return DEFAULT_ORIGINS
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export function buildApp() {
  const app = new Hono<AppEnv>()

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return null
        return getAllowedOrigins().includes(origin) ? origin : null
      },
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )

  // 認可ミドルウェア — /api/auth/register, /login は素通り、それ以外はトークン検証
  app.use('/api/*', async (c, next) => {
    if (c.req.path === '/api/auth/register' || c.req.path === '/api/auth/login') {
      return next()
    }
    const auth = c.req.header('authorization') || c.req.header('Authorization')
    const token = auth?.startsWith('Bearer ') ? auth.slice(7) : null
    if (!token) {
      return c.json({ error: 'authentication required' }, 401)
    }
    const userId = await verifyToken(token)
    if (!userId) {
      return c.json({ error: 'invalid or expired token' }, 401)
    }
    c.set('userId', userId)
    await next()
  })

  app.route('/api/auth', authRoutes)
  app.route('/api/tasks', taskRoutes)
  app.route('/api/categories', categoryRoutes)

  // 集約された 5xx ハンドラ（旧 handler.ts と同等の挙動）
  app.onError((err, c) => {
    return c.json({ error: String(err) }, 500)
  })

  return app
}
