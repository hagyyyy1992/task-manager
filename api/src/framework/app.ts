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

  // 不許可 Origin の preflight (OPTIONS) を 403 で明示的に拒否する (issue #65)。
  // 既存挙動: cors middleware は不許可 Origin に ACAO ヘッダーを付けないため
  // ブラウザが弾く (= 実害なし) が、204 が返るためペネトレツール/偵察を助長する。
  // CORS middleware より前に実行することで preflight を即時拒否する。
  // O(n) 検索だが allowedOrigins は通常 1-2 件なので Set 化は不要 (将来 10+ になったら検討)。
  // Origin ヘッダー無しの OPTIONS: 同一オリジンならブラウザは preflight を送らないため、
  // ここに来るのは CLI/curl 等の CORS 無関係リクエスト → Hono のルート挙動 (404/200) に委ねる。
  app.use('*', async (c, next) => {
    if (c.req.method !== 'OPTIONS') return next()
    const origin = c.req.header('origin')
    if (!origin) return next()
    if (!allowedOrigins.includes(origin)) {
      // 拒否 origin は構造化ログに残す (OWASP A09)。レスポンスは判定根拠を露出しない汎用文言に留める
      console.warn('cors.preflight.rejected', { origin })
      return c.json({ error: 'forbidden' }, 403)
    }
    return next()
  })

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

  // CSP-Report-Only の違反レポート受信口 (issue #58)。
  // ブラウザは Content-Type: application/csp-report で {"csp-report": {...}} を POST する。
  // 認証不要 (どのオリジンからでも観測したいため)、レスポンスは 204 で固定。
  // 受信内容は警告ログに残し、CloudWatch Logs Insights で集計する想定。
  app.post('/api/csp-report', async (c) => {
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch {
      // 壊れたレポートでも 204 を返す (ブラウザ側のリトライを避けるため)
    }
    console.warn('csp.violation', {
      ua: c.req.header('user-agent') ?? null,
      report: body,
    })
    return c.body(null, 204)
  })

  app.route('/api/auth', createAuthController(container))

  // /api/tasks, /api/categories は全エンドポイント認証必須
  const protectedApp = new Hono<AuthEnv>()
  protectedApp.use(
    '*',
    createAuthMiddleware(container.tokens, container.users, container.tokenRepo),
  )
  protectedApp.route('/tasks', createTasksController(container))
  protectedApp.route('/categories', createCategoriesController(container))
  app.route('/api', protectedApp)

  app.onError((err, c) => {
    console.error(err)
    return c.json({ error: 'internal server error' }, 500)
  })

  return app
}
