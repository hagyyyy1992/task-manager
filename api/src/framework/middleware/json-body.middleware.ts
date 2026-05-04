import type { MiddlewareHandler } from 'hono'

// POST/PATCH/PUT/DELETE で body が JSON でないケースを 400 で弾く。
// 弾かないと c.req.json() が controller で throw → onError 経由で 500 を返す。
// POST/PATCH/PUT は基本 body 必須なので、body 不在も 400 にする
// (controller 側で c.req.json() を呼んだ時の SyntaxError → 500 を防ぐ)。
// DELETE は body オプション (DELETE /tasks/:id 等は body 不要) なので、
// body が無ければ素通りし、body 不在でも問題が起きないよう controller 側で対処する。
const METHODS_REQUIRING_BODY = new Set(['POST', 'PATCH', 'PUT'])
const METHODS_WITH_OPTIONAL_BODY = new Set(['DELETE'])

export function createJsonBodyMiddleware(): MiddlewareHandler {
  return async (c, next) => {
    const method = c.req.method
    const requiresBody = METHODS_REQUIRING_BODY.has(method)
    const optionalBody = METHODS_WITH_OPTIONAL_BODY.has(method)
    if (!requiresBody && !optionalBody) return next()

    const ct = c.req.header('content-type')?.toLowerCase() ?? ''
    const contentLength = c.req.header('content-length')
    const hasBody = (contentLength !== undefined && contentLength !== '0') || ct !== ''
    if (!hasBody) {
      if (requiresBody) {
        return c.json({ error: 'request body is required' }, 400)
      }
      return next()
    }
    // ブラウザの CSP 違反レポートは Content-Type: application/csp-report で来る (RFC 7469)。
    // CSP-Report-Only の receiver (/api/csp-report) を JSON body 強制から除外する (issue #58)。
    if (!ct.includes('application/json') && !ct.includes('application/csp-report')) {
      return c.json({ error: 'Content-Type must be application/json' }, 400)
    }
    // application/csp-report は内部 JSON 構造の検証は受信側 handler に委ねる
    // (壊れた CSP report はログに残せれば十分で、400 で弾くより素通しの方が信号を失わない)。
    if (ct.includes('application/csp-report')) {
      return next()
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
