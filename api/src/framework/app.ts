import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createContainer, type Container, type ContainerOverrides } from './di/container.js'
import { createAuthMiddleware, type AuthEnv } from './middleware/auth.middleware.js'
import { createJsonBodyMiddleware } from './middleware/json-body.middleware.js'
import { createAuthController } from './controllers/auth.controller.js'
import { createTasksController } from './controllers/tasks.controller.js'
import { createCategoriesController } from './controllers/categories.controller.js'

const LOCAL_DEV_ORIGINS = ['http://localhost:5173']

function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS
  if (!env) {
    // 本番 origin はハードコードせず ALLOWED_ORIGINS で必ず明示注入させる（fail-closed）
    if (process.env.NODE_ENV === 'production') {
      console.warn('ALLOWED_ORIGINS is not set in production; rejecting all cross-origin requests')
      return []
    }
    return LOCAL_DEV_ORIGINS
  }
  return env
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

export interface BuildAppOptions {
  container?: Container
  containerOverrides?: ContainerOverrides
}

export function buildApp(options: BuildAppOptions = {}): Hono<AuthEnv> {
  const container = options.container ?? createContainer(options.containerOverrides)
  const app = new Hono<AuthEnv>()

  // CORS allowlist は buildApp 時点で 1 度だけ評価する（per-request の env 再パースを回避）
  const allowedOrigins = getAllowedOrigins()

  app.use(
    '*',
    cors({
      origin: (origin) => {
        if (!origin) return null
        return allowedOrigins.includes(origin) ? origin : null
      },
      allowMethods: ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS'],
      allowHeaders: ['Content-Type', 'Authorization'],
    }),
  )
  // ボディを伴う request の Content-Type と JSON 妥当性を一括検査して 400 を返す
  app.use('/api/*', createJsonBodyMiddleware())

  app.route('/api/auth', createAuthController(container))

  // /api/tasks, /api/categories は全エンドポイント認証必須
  const protectedApp = new Hono<AuthEnv>()
  protectedApp.use('*', createAuthMiddleware(container.tokens, container.users))
  protectedApp.route('/tasks', createTasksController(container))
  protectedApp.route('/categories', createCategoriesController(container))
  app.route('/api', protectedApp)

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'internal server error' }, 500)
  })

  return app
}
