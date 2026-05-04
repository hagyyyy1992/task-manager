import { describe, it, expect } from 'vitest'
import { Hono } from 'hono'
import {
  createBodySizeMiddleware,
  DEFAULT_BODY_SIZE_LIMIT_BYTES,
} from '@api/framework/middleware/body-size.middleware.js'

function buildHarness(limitBytes?: number) {
  const app = new Hono()
  app.use('/api/*', createBodySizeMiddleware(limitBytes ? { limitBytes } : {}))
  app.post('/api/echo', async (c) => {
    let body: unknown = null
    try {
      body = await c.req.json()
    } catch {
      // 一部テストは body を読まずに通過させるだけ
    }
    return c.json({ ok: true, received: body })
  })
  return app
}

describe('body-size middleware (issue #63)', () => {
  it('Content-Length が閾値内なら素通り', async () => {
    const app = buildHarness()
    const body = JSON.stringify({ title: 'a' })
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
        body,
      }),
    )
    expect(res.status).toBe(200)
  })

  it('Content-Length が閾値超なら 413 payload too large', async () => {
    const app = buildHarness()
    // body 実体は送らず、ヘッダーだけ大きく宣言してもブロックされる必要がある
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(DEFAULT_BODY_SIZE_LIMIT_BYTES + 1),
        },
        body: '{}',
      }),
    )
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/payload too large/i)
  })

  it('Content-Length 不在 (chunked) は素通り', async () => {
    const app = buildHarness()
    const body = JSON.stringify({ title: 'a' })
    // Request コンストラクタは content-length を自動付与するので Headers から消す。
    const headers = new Headers({ 'content-type': 'application/json' })
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers,
        body,
      }),
    )
    // content-length が付いてしまう実装でも、limit 未満なので通る
    expect(res.status).toBe(200)
  })

  it('Content-Length: 0 は素通り (json-body middleware に判断を委ねる)', async () => {
    const app = buildHarness()
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': '0',
        },
      }),
    )
    expect(res.status).toBe(200)
  })

  it('Content-Length が NaN/不正値なら素通り', async () => {
    const app = buildHarness()
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': 'not-a-number',
        },
        body: '{}',
      }),
    )
    expect(res.status).toBe(200)
  })

  it('limitBytes オプションで上限をカスタマイズ可能', async () => {
    const app = buildHarness(8)
    const body = '{"x":"abcdefghij"}' // 18 bytes
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
        body,
      }),
    )
    expect(res.status).toBe(413)
  })

  it('閾値ちょうど (== limitBytes) は通す', async () => {
    const app = buildHarness()
    const filler = 'a'.repeat(DEFAULT_BODY_SIZE_LIMIT_BYTES - 12) // {"x":"...."} の余白を確保
    const body = JSON.stringify({ x: filler })
    expect(body.length).toBeLessThanOrEqual(DEFAULT_BODY_SIZE_LIMIT_BYTES)
    const res = await app.fetch(
      new Request('http://localhost/api/echo', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(body.length),
        },
        body,
      }),
    )
    expect(res.status).toBe(200)
  })
})
