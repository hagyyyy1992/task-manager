import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { createContainer, type Container, type ContainerOverrides } from './di/container.js'
import { createAuthMiddleware, type AuthEnv } from './middleware/auth.middleware.js'
import { createAuthController } from './controllers/auth.controller.js'
import { createTasksController } from './controllers/tasks.controller.js'
import { createCategoriesController } from './controllers/categories.controller.js'

const DEFAULT_ORIGINS = ['http://localhost:5173', 'https://d3pi0juuilndgb.cloudfront.net']

function getAllowedOrigins(): string[] {
  const env = process.env.ALLOWED_ORIGINS
  if (!env) return DEFAULT_ORIGINS
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

  app.route('/api/auth', createAuthController(container))

  // /api/tasks, /api/categories は全エンドポイント認証必須
  const protectedApp = new Hono<AuthEnv>()
  protectedApp.use('*', createAuthMiddleware(container.tokens))
  protectedApp.route('/tasks', createTasksController(container))
  protectedApp.route('/categories', createCategoriesController(container))
  app.route('/api', protectedApp)

  app.onError((err, c) => c.json({ error: String(err) }, 500))

  return app
}
