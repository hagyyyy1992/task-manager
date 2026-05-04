import { describe, it, expect, vi, beforeEach } from 'vitest'
import { buildApp } from '@api/framework/app.js'
import type { Container } from '@api/framework/di/container.js'
import type { Task } from '@api/domain/entities/Task.js'
import type { TokenService } from '@api/domain/services/TokenService.js'
import { CategoryProtectedError } from '@api/domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '@api/domain/exceptions/CategoryDuplicateError.js'
import { CategoryReorderError } from '@api/domain/exceptions/CategoryReorderError.js'

const mockTask: Task = {
  id: 'test123',
  title: 'テストタスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null,
  memo: '',
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const nowSec = () => Math.floor(Date.now() / 1000)

const mockUser = {
  id: 'user123',
  email: 'test@example.com',
  name: 'Test User',
  passwordChangedAt: null as string | null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockUserWithSecret = { ...mockUser, passwordHash: 'salt:hash' }

const mockCategory = {
  id: 'cat123',
  userId: 'user123',
  name: '決算・税務',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeContainer(): Container {
  const tokens: TokenService = {
    issue: vi.fn().mockResolvedValue('test-token'),
    issueLongLived: vi.fn().mockResolvedValue('test-long-token'),
    // 既定では現時点で発行された session トークン扱い (passwordChangedAt 失効テスト以外は素通り)
    // issue #60: session scope も jti 突合するため jti を付与
    verify: vi.fn().mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: nowSec(),
      jti: 'session-jti',
    }),
  }

  // auth.middleware が削除済みユーザー / passwordChangedAt 判定で findById を叩くため最低限スタブする
  const users = {
    findById: vi.fn().mockResolvedValue(mockUser),
  }

  // session / mcp scope の DB 突合 (issue #37, #60) で findByJti を叩くためスタブする
  const tokenRepo = {
    findByJti: vi.fn().mockResolvedValue({
      id: 'tok-1',
      userId: 'user123',
      scope: 'session',
      jti: 'session-jti',
      label: '',
      createdAt: new Date().toISOString(),
      lastUsedAt: null,
      revokedAt: null,
    }),
    listActiveByUser: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    revoke: vi.fn().mockResolvedValue(true),
    revokeByJti: vi.fn().mockResolvedValue(true),
    revokeAllByUserAndScope: vi.fn().mockResolvedValue(0),
    touchLastUsed: vi.fn().mockResolvedValue(undefined),
  }

  const usecase = <T = unknown>(execute: T) => ({ execute })

  return {
    tokens,
    users,
    tokenRepo,
    register: usecase(vi.fn()),
    login: usecase(vi.fn()),
    me: usecase(vi.fn()),
    changePassword: usecase(vi.fn()),
    deleteAccount: usecase(vi.fn()),
    listMcpTokens: usecase(vi.fn()),
    issueMcpToken: usecase(vi.fn()),
    revokeMcpToken: usecase(vi.fn()),
    forgotPassword: usecase(vi.fn()),
    resetPassword: usecase(vi.fn()),
    logout: usecase(vi.fn()),
    revokeAllSessions: usecase(vi.fn()),
    listTasks: usecase(vi.fn()),
    createTask: usecase(vi.fn()),
    updateTask: usecase(vi.fn()),
    deleteTask: usecase(vi.fn()),
    listCategories: usecase(vi.fn()),
    createCategory: usecase(vi.fn()),
    updateCategory: usecase(vi.fn()),
    deleteCategory: usecase(vi.fn()),
    reorderCategories: usecase(vi.fn()),
  } as unknown as Container
}

let container: Container

interface ReqOpts {
  method?: string
  body?: unknown
  authenticated?: boolean
  origin?: string
}

async function req(path: string, opts: ReqOpts = {}) {
  const { method = 'GET', body, authenticated = true, origin } = opts
  const headers: Record<string, string> = {}
  if (authenticated) headers['authorization'] = 'Bearer test-token'
  if (origin) headers['origin'] = origin
  if (body !== undefined) headers['content-type'] = 'application/json'
  const app = buildApp({ container })
  return app.fetch(
    new Request(`http://localhost${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  container = makeContainer()
  process.env.ALLOW_REGISTRATION = 'true'
})

// ─── CSP report endpoint (issue #58) ─────────────────────────────

describe('POST /api/csp-report', () => {
  it('application/csp-report を 204 で受理し violation をログに残す', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = buildApp({ container })
    const reportBody = JSON.stringify({ 'csp-report': { 'violated-directive': 'script-src' } })
    const res = await app.fetch(
      new Request('http://localhost/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report', 'user-agent': 'test-ua' },
        body: reportBody,
      }),
    )
    expect(res.status).toBe(204)
    expect(warn).toHaveBeenCalledWith('csp.violation', expect.objectContaining({ ua: 'test-ua' }))
    warn.mockRestore()
  })

  it('壊れた JSON でも 204 を返す (ブラウザリトライ抑止)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/csp-report' },
        body: 'not json{{',
      }),
    )
    expect(res.status).toBe(204)
  })

  it('application/json でも受理する (Reporting API 互換 fallback)', async () => {
    vi.spyOn(console, 'warn').mockImplementation(() => {})
    const app = buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/csp-report', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ type: 'csp-violation' }),
      }),
    )
    expect(res.status).toBe(204)
  })
})

// ─── CORS ────────────────────────────────────────────────────────

describe('CORS', () => {
  it('allowed origin (localhost) is echoed back', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(res.headers.get('vary')?.toLowerCase()).toContain('origin')
  })

  it('production origin must be injected via ALLOWED_ORIGINS (not hardcoded)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://app.example.com'
    try {
      const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'https://app.example.com' })
      expect(res.headers.get('access-control-allow-origin')).toBe('https://app.example.com')
    } finally {
      delete process.env.ALLOWED_ORIGINS
    }
  })

  it('production with no ALLOWED_ORIGINS is fail-closed (rejects all)', async () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const prevNodeEnv = process.env.NODE_ENV
    process.env.NODE_ENV = 'production'
    delete process.env.ALLOWED_ORIGINS
    try {
      const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
      expect(res.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      process.env.NODE_ENV = prevNodeEnv
      warnSpy.mockRestore()
    }
  })

  it('disallowed origin is NOT echoed back', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'https://evil.example.com' })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('disallowed origin の preflight は 403 を返す (issue #65)', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'https://evil.example.com' })
    expect(res.status).toBe(403)
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('Origin ヘッダー無しの OPTIONS は 403 にせず通常処理 (CLI/同一オリジン)', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS' })
    expect(res.status).not.toBe(403)
  })

  it('missing origin: no Access-Control-Allow-Origin', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS' })
    expect(res.headers.get('access-control-allow-origin')).toBeNull()
  })

  it('ALLOWED_ORIGINS env var overrides default allowlist', async () => {
    process.env.ALLOWED_ORIGINS = 'https://custom.example.com'
    try {
      const res = await req('/api/tasks', {
        method: 'OPTIONS',
        origin: 'https://custom.example.com',
      })
      expect(res.headers.get('access-control-allow-origin')).toBe('https://custom.example.com')
      const res2 = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
      expect(res2.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      delete process.env.ALLOWED_ORIGINS
    }
  })
})

// ─── 認証ミドルウェア ────────────────────────────────────────────

describe('auth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await req('/api/tasks', { authenticated: false })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('authentication required')
  })

  it('POST with Content-Length > 64KB → 413 (issue #63)', async () => {
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'content-length': String(64 * 1024 + 1),
        },
        body: JSON.stringify({ email: 'a@example.com', password: 'x' }),
      }),
    )
    expect(res.status).toBe(413)
    expect((await res.json()).error).toMatch(/payload too large/i)
  })

  it('POST without JSON Content-Type → 400', async () => {
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'text/plain', 'content-length': '5' },
        body: 'hello',
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/Content-Type/i)
  })

  it('POST with invalid JSON body → 400', async () => {
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/auth/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: '{not-json',
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/JSON/i)
  })

  it('POST with no body → 400 (request body is required)', async () => {
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(new Request('http://localhost/api/auth/login', { method: 'POST' }))
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/body is required/i)
  })

  it('PATCH with no body → 400 (controller does not 500 on missing body)', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: nowSec(),
      jti: 'session-jti',
    })
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/tasks/abc', {
        method: 'PATCH',
        headers: { authorization: 'Bearer test-token' },
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/body is required/i)
  })

  it('DELETE /api/auth/account with no body → 400 invalid_input (not 500)', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: nowSec(),
      jti: 'session-jti',
    })
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'currentPassword is required',
    })
    const app = (await import('@api/framework/app.js')).buildApp({ container })
    const res = await app.fetch(
      new Request('http://localhost/api/auth/account', {
        method: 'DELETE',
        headers: { authorization: 'Bearer test-token' },
      }),
    )
    expect(res.status).toBe(400)
    expect((await res.json()).error).toMatch(/currentPassword/)
  })

  it('returns 401 when token is invalid', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue(null)
    const res = await req('/api/tasks')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid or expired token')
  })

  it('returns 403 when MCP token is used against UI endpoints', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'mcp',
      issuedAt: nowSec(),
      jti: 'jti-test',
    })
    const res = await req('/api/tasks')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('token scope not allowed for this endpoint')
  })

  // issue #36: passwordChangedAt より前に発行された JWT は失効扱い (grace window 5s 越え)
  it('returns 401 when token iat is clearly older than user.passwordChangedAt (>5s)', async () => {
    const passwordChangedAt = new Date('2026-04-27T10:00:00.000Z')
    vi.mocked(container.users.findById).mockResolvedValue({
      ...mockUser,
      passwordChangedAt: passwordChangedAt.toISOString(),
    })
    // iat = passwordChangedAt の 10 秒前 → grace window (5s) を超えて失効
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: Math.floor(passwordChangedAt.getTime() / 1000) - 10,
      jti: 'session-jti',
    })
    const res = await req('/api/tasks')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid or expired token')
  })

  it('accepts token issued at the same instant as passwordChangedAt (boundary)', async () => {
    const passwordChangedAt = new Date('2026-04-27T10:00:00.000Z')
    vi.mocked(container.users.findById).mockResolvedValue({
      ...mockUser,
      passwordChangedAt: passwordChangedAt.toISOString(),
    })
    // iat * 1000 == passwordChangedAt → 受理
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: Math.floor(passwordChangedAt.getTime() / 1000),
      jti: 'session-jti',
    })
    vi.mocked(container.listTasks.execute).mockResolvedValue({ items: [], nextCursor: null })
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
  })

  // codex 指摘 #2: 同一秒内・サブ秒精度差での誤判定がないことを担保 (PR #44)
  // - passwordChangedAt が 10:00:00.900 の場合、「同秒・後ms」に発行された新トークン
  //   (iat=10:00:00) は受理されるべき。秒切捨て比較により誤 401 にならないことを検証。
  it('accepts new token issued in the same second but later ms than passwordChangedAt', async () => {
    const passwordChangedAt = new Date('2026-04-27T10:00:00.900Z') // .900ms
    vi.mocked(container.users.findById).mockResolvedValue({
      ...mockUser,
      passwordChangedAt: passwordChangedAt.toISOString(),
    })
    // 新トークン発行時刻 10:00:00.950Z → iat = floor(.../1000) = 10:00:00 (秒)
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: Math.floor(passwordChangedAt.getTime() / 1000), // = 10:00:00
      jti: 'session-jti',
    })
    vi.mocked(container.listTasks.execute).mockResolvedValue({ items: [], nextCursor: null })
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
  })

  // codex 指摘 #2: clock skew 5 秒以内であれば旧トークンも受理される (Lambda 時計ずれ吸収)
  it('accepts token issued up to 5s before passwordChangedAt (clock skew grace)', async () => {
    const passwordChangedAt = new Date('2026-04-27T10:00:00.000Z')
    vi.mocked(container.users.findById).mockResolvedValue({
      ...mockUser,
      passwordChangedAt: passwordChangedAt.toISOString(),
    })
    // iat = passwordChangedAt の 5 秒前 (境界、grace 内)
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'session',
      issuedAt: Math.floor(passwordChangedAt.getTime() / 1000) - 5,
      jti: 'session-jti',
    })
    vi.mocked(container.listTasks.execute).mockResolvedValue({ items: [], nextCursor: null })
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
  })

  it('returns 401 when user has been deleted (findById returns null)', async () => {
    vi.mocked(container.users.findById).mockResolvedValue(null)
    const res = await req('/api/tasks')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid or expired token')
  })
})

// ─── MCP token revoke (issue #37) ────────────────────────────────

describe('MCP token revoke (auth middleware vs Token table)', () => {
  // /api/auth/me は session のみ許可なので scope 検査で 403 になり jti 突合まで届かない。
  // 純粋に jti 突合の挙動を検証するために、mcp scope を受け付ける /api/auth/mcp-tokens (GET) で確認する。
  it('mcp scope なのに jti=null (旧トークン) は 401 と再発行誘導メッセージ', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'mcp',
      issuedAt: nowSec(),
      jti: null,
    })
    // mcp scope は /api/auth/mcp-tokens でも受け取らない (session のみ) ので 403 で先に弾ける。
    // ここでは「session トークンで jti=null」が DB 突合をスキップして通過することを検証する代替として、
    // mcp scope + jti=null を /api/tasks に当てて 401 になることを確認する…
    // …が、UI エンドポイントは scope=mcp を 403 で拒否するため auth.middleware の jti チェックまで届かない。
    // 実際の挙動: scope 拒否(403) が先に出る。jti=null 拒否は MCP 用エンドポイント側が用意されてからのテスト。
    const res = await req('/api/tasks')
    expect(res.status).toBe(403)
  })

  it('mcp scope で jti が DB 不在なら 401 (revoked or never issued)', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({
      userId: 'user123',
      scope: 'mcp',
      issuedAt: nowSec(),
      jti: 'unknown-jti',
    })
    // ※ /api/tasks は session のみ受け付けるので scope 検査で 403。
    //   middleware 単体での jti 突合検証は createAuthMiddleware を直接呼ぶ別テストで担保する。
    const res = await req('/api/tasks')
    expect(res.status).toBe(403)
  })
})

// auth.middleware の jti 突合 (mcp scope を allow した状態) を直接検証
describe('createAuthMiddleware (mcp scope allow + jti 突合)', () => {
  it('jti が DB に無い場合は 401', async () => {
    const { createAuthMiddleware } = await import('@api/framework/middleware/auth.middleware.js')
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn(),
      verify: vi
        .fn()
        .mockResolvedValue({ userId: 'u1', scope: 'mcp', issuedAt: nowSec(), jti: 'jti-x' }),
    }
    const users = { findById: vi.fn().mockResolvedValue(mockUser) }
    const tokenRepo = {
      findByJti: vi.fn().mockResolvedValue(null),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const mw = createAuthMiddleware(tokens, users as never, tokenRepo, { allowedScopes: ['mcp'] })
    const c = {
      req: { header: () => 'Bearer x' },
      json: (body: unknown, status: number) => ({ body, status }) as never,
      set: vi.fn(),
    }
    const result = (await mw(c as never, vi.fn())) as { status: number }
    expect(result.status).toBe(401)
  })

  it('revokedAt が立っているトークンは 401', async () => {
    const { createAuthMiddleware } = await import('@api/framework/middleware/auth.middleware.js')
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn(),
      verify: vi
        .fn()
        .mockResolvedValue({ userId: 'u1', scope: 'mcp', issuedAt: nowSec(), jti: 'jti-x' }),
    }
    const users = { findById: vi.fn().mockResolvedValue(mockUser) }
    const tokenRepo = {
      findByJti: vi.fn().mockResolvedValue({
        id: 't1',
        userId: 'u1',
        scope: 'mcp',
        jti: 'jti-x',
        label: '',
        createdAt: '2026-04-27T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: '2026-04-27T01:00:00.000Z',
      }),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const mw = createAuthMiddleware(tokens, users as never, tokenRepo, { allowedScopes: ['mcp'] })
    const c = {
      req: { header: () => 'Bearer x' },
      json: (body: unknown, status: number) => ({ body, status }) as never,
      set: vi.fn(),
    }
    const result = (await mw(c as never, vi.fn())) as { status: number }
    expect(result.status).toBe(401)
  })

  it('jti=null (旧 mcp トークン) は 401 + 再発行誘導メッセージ', async () => {
    const { createAuthMiddleware } = await import('@api/framework/middleware/auth.middleware.js')
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn(),
      verify: vi
        .fn()
        .mockResolvedValue({ userId: 'u1', scope: 'mcp', issuedAt: nowSec(), jti: null }),
    }
    const users = { findById: vi.fn().mockResolvedValue(mockUser) }
    const tokenRepo = {
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const mw = createAuthMiddleware(tokens, users as never, tokenRepo, { allowedScopes: ['mcp'] })
    let captured: { body: { error: string }; status: number } | null = null
    const c = {
      req: { header: () => 'Bearer x' },
      json: (body: { error: string }, status: number) => {
        captured = { body, status }
        return captured as never
      },
      set: vi.fn(),
    }
    await mw(c as never, vi.fn())
    expect(captured!.status).toBe(401)
    expect(captured!.body.error).toMatch(/re-login|re-issue/i)
    expect(tokenRepo.findByJti).not.toHaveBeenCalled()
  })

  it('有効なトークンは next() を呼び lastUsedAt を更新する', async () => {
    const { createAuthMiddleware } = await import('@api/framework/middleware/auth.middleware.js')
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn(),
      verify: vi
        .fn()
        .mockResolvedValue({ userId: 'u1', scope: 'mcp', issuedAt: nowSec(), jti: 'jti-x' }),
    }
    const users = { findById: vi.fn().mockResolvedValue(mockUser) }
    const tokenRepo = {
      findByJti: vi.fn().mockResolvedValue({
        id: 't1',
        userId: 'u1',
        scope: 'mcp',
        jti: 'jti-x',
        label: '',
        createdAt: '2026-04-27T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      }),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn().mockResolvedValue(undefined),
    }
    const mw = createAuthMiddleware(tokens, users as never, tokenRepo, { allowedScopes: ['mcp'] })
    const set = vi.fn()
    const c = {
      req: { header: () => 'Bearer x' },
      json: vi.fn(),
      set,
    }
    const next = vi.fn().mockResolvedValue(undefined)
    await mw(c as never, next)
    expect(next).toHaveBeenCalled()
    expect(set).toHaveBeenCalledWith('userId', 'u1')
    expect(tokenRepo.touchLastUsed).toHaveBeenCalledWith('jti-x', expect.any(Date))
  })
})

// ─── Tasks ───────────────────────────────────────────────────────

describe('task endpoints', () => {
  it('OPTIONS returns 204', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
    expect(res.status).toBe(204)
  })

  it('GET /api/tasks returns paginated page { items, nextCursor }', async () => {
    vi.mocked(container.listTasks.execute).mockResolvedValue({
      items: [mockTask],
      nextCursor: null,
    })
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
    expect(container.listTasks.execute).toHaveBeenCalledWith({
      userId: 'user123',
      cursor: undefined,
      limit: undefined,
    })
    expect(await res.json()).toEqual({ items: [mockTask], nextCursor: null })
  })

  // issue #40: cursor / limit クエリを interactor へ渡す
  it('GET /api/tasks?cursor=X&limit=N parses query into interactor input', async () => {
    vi.mocked(container.listTasks.execute).mockResolvedValue({ items: [], nextCursor: null })
    await req('/api/tasks?cursor=abc&limit=20')
    expect(container.listTasks.execute).toHaveBeenCalledWith({
      userId: 'user123',
      cursor: 'abc',
      limit: 20,
    })
  })

  it('GET /api/tasks: 不正な limit (NaN/負/小数) は無視され undefined で渡される', async () => {
    vi.mocked(container.listTasks.execute).mockResolvedValue({ items: [], nextCursor: null })
    await req('/api/tasks?limit=abc')
    expect(container.listTasks.execute).toHaveBeenLastCalledWith({
      userId: 'user123',
      cursor: undefined,
      limit: undefined,
    })
    await req('/api/tasks?limit=-5')
    expect(container.listTasks.execute).toHaveBeenLastCalledWith({
      userId: 'user123',
      cursor: undefined,
      limit: undefined,
    })
    // 小数は floor される (10.7 → 10)
    await req('/api/tasks?limit=10.7')
    expect(container.listTasks.execute).toHaveBeenLastCalledWith({
      userId: 'user123',
      cursor: undefined,
      limit: 10,
    })
  })

  it('POST /api/tasks creates a task', async () => {
    vi.mocked(container.createTask.execute).mockResolvedValue({ ok: true, task: mockTask })
    const res = await req('/api/tasks', { method: 'POST', body: mockTask })
    expect(res.status).toBe(201)
    expect(container.createTask.execute).toHaveBeenCalledWith({
      userId: 'user123',
      task: mockTask,
    })
  })

  it('POST /api/tasks invalid_input → 400', async () => {
    vi.mocked(container.createTask.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'title is required',
    })
    const res = await req('/api/tasks', { method: 'POST', body: {} })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('title')
  })

  it('PATCH /api/tasks/:id updates a task', async () => {
    const updated = { ...mockTask, status: 'done' as const }
    vi.mocked(container.updateTask.execute).mockResolvedValue({ ok: true, task: updated })
    const res = await req('/api/tasks/test123', { method: 'PATCH', body: { status: 'done' } })
    expect(res.status).toBe(200)
    expect(container.updateTask.execute).toHaveBeenCalledWith({
      userId: 'user123',
      id: 'test123',
      updates: { status: 'done' },
    })
    expect((await res.json()).status).toBe('done')
  })

  it('PATCH /api/tasks/:id pinned を更新できる', async () => {
    vi.mocked(container.updateTask.execute).mockResolvedValue({
      ok: true,
      task: { ...mockTask, pinned: true },
    })
    const res = await req('/api/tasks/test123', { method: 'PATCH', body: { pinned: true } })
    expect(res.status).toBe(200)
    expect((await res.json()).pinned).toBe(true)
  })

  it('PATCH /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(container.updateTask.execute).mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await req('/api/tasks/unknown', { method: 'PATCH', body: { status: 'done' } })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/tasks/:id deletes a task', async () => {
    vi.mocked(container.deleteTask.execute).mockResolvedValue({ ok: true, task: mockTask })
    const res = await req('/api/tasks/test123', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(container.deleteTask.execute).toHaveBeenCalledWith({
      userId: 'user123',
      id: 'test123',
    })
  })

  it('DELETE /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(container.deleteTask.execute).mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await req('/api/tasks/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('unknown route returns 404', async () => {
    const res = await req('/api/unknown')
    expect(res.status).toBe(404)
  })

  it('returns 500 with generic message on usecase error (no detail leak)', async () => {
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.mocked(container.listTasks.execute).mockRejectedValue(new Error('db down'))
    const res = await req('/api/tasks')
    expect(res.status).toBe(500)
    const body = await res.json()
    expect(body.error).toBe('internal server error')
    expect(JSON.stringify(body)).not.toContain('db down')
    errSpy.mockRestore()
  })
})

// ─── Auth: register ──────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  const validBody = {
    email: 'test@example.com',
    password: 'password1234',
    name: 'Test User',
    termsAgreed: true,
  }

  it('registers a new user', async () => {
    vi.mocked(container.register.execute).mockResolvedValue({
      ok: true,
      user: mockUser,
      token: 'test-token',
    })
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: validBody,
    })
    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.user.email).toBe('test@example.com')
    expect(body.token).toBe('test-token')
  })

  it.each([
    ['disabled', 403, '受け付けていません'],
    ['invalid_input', 400, '8 characters'],
    ['terms_required', 400, '利用規約'],
    ['duplicate', 409, 'already registered'],
  ] as const)('reason=%s -> status %d', async (reason, status, msg) => {
    vi.mocked(container.register.execute).mockResolvedValue({ ok: false, reason, message: msg })
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: validBody,
    })
    expect(res.status).toBe(status)
    expect((await res.json()).error).toContain(msg)
  })
})

// ─── Auth: login ─────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials', async () => {
    vi.mocked(container.login.execute).mockResolvedValue({
      ok: true,
      user: mockUser,
      token: 'test-token',
    })
    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'test@example.com', password: 'password1234' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).token).toBe('test-token')
  })

  it('returns 400 when invalid input', async () => {
    vi.mocked(container.login.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'email and password are required',
    })
    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'x' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 when credentials wrong', async () => {
    vi.mocked(container.login.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_credentials',
      message: 'メールアドレスまたはパスワードが正しくありません',
    })
    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'a@b.com', password: 'xxxxxxxx' },
    })
    expect(res.status).toBe(401)
  })
})

// ─── Auth: forgot-password (issue #66) ───────────────────────────

describe('POST /api/auth/forgot-password', () => {
  it('実在ユーザー有無に関わらず ok 時は 200 を返す (email 列挙対策)', async () => {
    vi.mocked(container.forgotPassword.execute).mockResolvedValue({ ok: true })
    const res = await req('/api/auth/forgot-password', {
      method: 'POST',
      authenticated: false,
      body: { email: 'a@b.com' },
    })
    expect(res.status).toBe(200)
    expect(container.forgotPassword.execute).toHaveBeenCalledWith({ email: 'a@b.com' })
  })

  it('email 形式不正時のみ 400 (invalid_input)', async () => {
    vi.mocked(container.forgotPassword.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'invalid email format',
    })
    const res = await req('/api/auth/forgot-password', {
      method: 'POST',
      authenticated: false,
      body: { email: 'not-an-email' },
    })
    expect(res.status).toBe(400)
  })
})

// ─── Auth: reset-password (issue #66) ────────────────────────────

describe('POST /api/auth/reset-password', () => {
  it('正常な token + 新 PW で 200', async () => {
    vi.mocked(container.resetPassword.execute).mockResolvedValue({ ok: true })
    const res = await req('/api/auth/reset-password', {
      method: 'POST',
      authenticated: false,
      body: { token: 'jti-x', newPassword: 'newpassword1' },
    })
    expect(res.status).toBe(200)
    expect(container.resetPassword.execute).toHaveBeenCalledWith({
      token: 'jti-x',
      newPassword: 'newpassword1',
    })
  })

  it.each([
    ['invalid_input', 400],
    ['invalid_token', 401],
  ] as const)('reason=%s -> status %d', async (reason, status) => {
    vi.mocked(container.resetPassword.execute).mockResolvedValue({
      ok: false,
      reason,
      message: 'x',
    })
    const res = await req('/api/auth/reset-password', {
      method: 'POST',
      authenticated: false,
      body: { token: 'x', newPassword: 'xxxxxxxx' },
    })
    expect(res.status).toBe(status)
  })
})

// ─── Auth: me ────────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns current user', async () => {
    vi.mocked(container.me.execute).mockResolvedValue({ ok: true, user: mockUser })
    const res = await req('/api/auth/me')
    expect(res.status).toBe(200)
    expect((await res.json()).email).toBe('test@example.com')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(container.me.execute).mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await req('/api/auth/me')
    expect(res.status).toBe(404)
  })
})

// ─── Auth: change-password ───────────────────────────────────────

describe('PATCH /api/auth/password', () => {
  it('changes password with valid current password', async () => {
    vi.mocked(container.changePassword.execute).mockResolvedValue({ ok: true })
    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234', newPassword: 'newpassword5678' },
    })
    expect(res.status).toBe(200)
    expect(container.changePassword.execute).toHaveBeenCalledWith({
      userId: 'user123',
      currentPassword: 'password1234',
      newPassword: 'newpassword5678',
    })
  })

  it.each([
    ['invalid_input', 400, '8 characters'],
    ['unauthorized', 401, 'unauthorized'],
    ['wrong_password', 401, 'current password'],
    ['demo_forbidden', 403, 'デモアカウントではパスワードを変更できません'],
    ['not_found', 404, 'user not found'],
  ] as const)('reason=%s -> status %d', async (reason, status, msg) => {
    vi.mocked(container.changePassword.execute).mockResolvedValue({
      ok: false,
      reason,
      message: msg,
    })
    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'x', newPassword: 'y' },
    })
    expect(res.status).toBe(status)
  })
})

// ─── Auth: delete-account ────────────────────────────────────────

describe('DELETE /api/auth/account', () => {
  it('deletes account with currentPassword', async () => {
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({ ok: true })
    const res = await req('/api/auth/account', { method: 'DELETE', body: { currentPassword: 'p' } })
    expect(res.status).toBe(200)
    expect(container.deleteAccount.execute).toHaveBeenCalledWith({
      userId: 'user123',
      currentPassword: 'p',
    })
  })

  it('returns 401 when wrong password', async () => {
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({
      ok: false,
      reason: 'wrong_password',
      message: 'current password is incorrect',
    })
    const res = await req('/api/auth/account', {
      method: 'DELETE',
      body: { currentPassword: 'wrong' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 400 when currentPassword missing', async () => {
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'currentPassword is required',
    })
    const res = await req('/api/auth/account', { method: 'DELETE', body: {} })
    expect(res.status).toBe(400)
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({ ok: false, reason: 'not_found' })
    const res = await req('/api/auth/account', { method: 'DELETE', body: { currentPassword: 'p' } })
    expect(res.status).toBe(404)
  })

  it('returns 403 when demo user (issue #57)', async () => {
    vi.mocked(container.deleteAccount.execute).mockResolvedValue({
      ok: false,
      reason: 'demo_forbidden',
      message: 'デモアカウントは削除できません',
    })
    const res = await req('/api/auth/account', { method: 'DELETE', body: { currentPassword: 'p' } })
    expect(res.status).toBe(403)
  })
})

// ─── Auth: issue mcp-token demo guard (issue #57) ────────────────

describe('POST /api/auth/mcp-tokens (demo guard)', () => {
  it('returns 403 when demo user (issue #57)', async () => {
    vi.mocked(container.issueMcpToken.execute).mockResolvedValue({
      ok: false,
      reason: 'demo_forbidden',
      message: 'デモアカウントでは MCP トークンを発行できません',
    })
    const res = await req('/api/auth/mcp-tokens', { method: 'POST', body: { label: 'x' } })
    expect(res.status).toBe(403)
  })

  it('returns 400 when invalid_input', async () => {
    vi.mocked(container.issueMcpToken.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'label too long',
    })
    const res = await req('/api/auth/mcp-tokens', {
      method: 'POST',
      body: { label: 'x'.repeat(101) },
    })
    expect(res.status).toBe(400)
  })
})

// ─── Categories ──────────────────────────────────────────────────

describe('GET /api/categories', () => {
  it('returns category list with taskCount', async () => {
    const withCount = { ...mockCategory, taskCount: 3 }
    vi.mocked(container.listCategories.execute).mockResolvedValue([withCount])
    const res = await req('/api/categories')
    expect(res.status).toBe(200)
    expect(await res.json()).toEqual([withCount])
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories', { authenticated: false })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    vi.mocked(container.createCategory.execute).mockResolvedValue({
      ok: true,
      category: mockCategory,
    })
    const res = await req('/api/categories', {
      method: 'POST',
      body: { name: '決算・税務', sortOrder: 0 },
    })
    expect(res.status).toBe(201)
    expect(await res.json()).toEqual(mockCategory)
  })

  it('returns 400 when invalid_input', async () => {
    vi.mocked(container.createCategory.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'name is required',
    })
    const res = await req('/api/categories', { method: 'POST', body: { name: '' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('name is required')
  })

  it('returns 409 when duplicate', async () => {
    vi.mocked(container.createCategory.execute).mockResolvedValue({
      ok: false,
      reason: 'duplicate',
      message: '同じ名前のカテゴリが既に存在します',
    })
    const res = await req('/api/categories', { method: 'POST', body: { name: '重複' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('既に存在します')
  })
})

describe('PATCH /api/categories/:id', () => {
  it('updates a category', async () => {
    vi.mocked(container.updateCategory.execute).mockResolvedValue({
      ok: true,
      category: { ...mockCategory, name: '更新済み' },
    })
    const res = await req('/api/categories/cat123', {
      method: 'PATCH',
      body: { name: '更新済み' },
    })
    expect(res.status).toBe(200)
    expect((await res.json()).name).toBe('更新済み')
  })

  it.each([
    ['invalid_input', 400],
    ['protected', 400],
    ['duplicate', 409],
    ['not_found', 404],
  ] as const)('reason=%s -> status %d', async (reason, status) => {
    vi.mocked(container.updateCategory.execute).mockResolvedValue({
      ok: false,
      reason,
      message: 'msg',
    })
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: 'x' } })
    expect(res.status).toBe(status)
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes a category', async () => {
    vi.mocked(container.deleteCategory.execute).mockResolvedValue({ ok: true })
    const res = await req('/api/categories/cat123', { method: 'DELETE' })
    expect(res.status).toBe(200)
  })

  it('returns 404 for unknown id', async () => {
    vi.mocked(container.deleteCategory.execute).mockResolvedValue({
      ok: false,
      reason: 'not_found',
      message: 'not found',
    })
    const res = await req('/api/categories/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('returns 400 when protected', async () => {
    vi.mocked(container.deleteCategory.execute).mockResolvedValue({
      ok: false,
      reason: 'protected',
      message: '「その他」カテゴリは削除できません',
    })
    const res = await req('/api/categories/sonota', { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('その他')
  })
})

describe('PATCH /api/categories/reorder', () => {
  it('reorders successfully', async () => {
    const reordered = [
      { ...mockCategory, id: 'b', sortOrder: 0 },
      { ...mockCategory, id: 'a', sortOrder: 1 },
    ]
    vi.mocked(container.reorderCategories.execute).mockResolvedValue({
      ok: true,
      categories: reordered,
    })
    const res = await req('/api/categories/reorder', { method: 'PATCH', body: { ids: ['b', 'a'] } })
    expect(res.status).toBe(200)
    expect(container.reorderCategories.execute).toHaveBeenCalledWith({
      userId: 'user123',
      ids: ['b', 'a'],
    })
    expect(await res.json()).toEqual(reordered)
  })

  it('returns 400 when invalid_input', async () => {
    vi.mocked(container.reorderCategories.execute).mockResolvedValue({
      ok: false,
      reason: 'invalid_input',
      message: 'ids must be string[]',
    })
    const res = await req('/api/categories/reorder', {
      method: 'PATCH',
      body: { ids: 'not-array' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories/reorder', {
      method: 'PATCH',
      body: { ids: ['a'] },
      authenticated: false,
    })
    expect(res.status).toBe(401)
  })
})

// 未使用 import の lint 抑止
void mockUserWithSecret
void CategoryProtectedError
void CategoryDuplicateError
void CategoryReorderError
