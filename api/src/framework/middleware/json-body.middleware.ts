import type { MiddlewareHandler } from 'hono'

// POST/PATCH/PUT/DELETE で body が JSON でないケースを 400 で弾く。
// 弾かないと c.req.json() が controller で throw → onError 経由で 500 を返す。
const METHODS_WITH_BODY = new Set(['POST', 'PATCH', 'PUT', 'DELETE'])

export function createJsonBodyMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    if (!METHODS_WITH_BODY.has(c.req.method)) return next()
    const ct = c.req.header('content-type')?.toLowerCase() ?? ''
    const contentLength = c.req.header('content-length')
    const hasBody = (contentLength !== undefined && contentLength !== '0') || ct !== ''
    if (!hasBody) return next()
    if (!ct.includes('application/json')) {
      return c.json({ error: 'Content-Type must be application/json' }, 400)
    }
    try {
      // パース結果を c.req.json() のキャッシュに乗せておく（Hono は内部キャッシュする）
      await c.req.json()
    } catch {
      return c.json({ error: 'invalid JSON body' }, 400)
    }
    return next()
  }
}
