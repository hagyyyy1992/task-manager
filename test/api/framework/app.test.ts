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

const mockUser = {
  id: 'user123',
  email: 'test@example.com',
  name: 'Test User',
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
    verify: vi.fn().mockResolvedValue({ userId: 'user123', scope: 'session' }),
  }

  const usecase = <T = unknown>(execute: T) => ({ execute })

  return {
    tokens,
    register: usecase(vi.fn()),
    login: usecase(vi.fn()),
    me: usecase(vi.fn()),
    changePassword: usecase(vi.fn()),
    deleteAccount: usecase(vi.fn()),
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

  it('returns 401 when token is invalid', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue(null)
    const res = await req('/api/tasks')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid or expired token')
  })

  it('returns 403 when MCP token is used against UI endpoints', async () => {
    vi.mocked(container.tokens.verify).mockResolvedValue({ userId: 'user123', scope: 'mcp' })
    const res = await req('/api/tasks')
    expect(res.status).toBe(403)
    expect((await res.json()).error).toBe('token scope not allowed for this endpoint')
  })
})

// ─── Tasks ───────────────────────────────────────────────────────

describe('task endpoints', () => {
  it('OPTIONS returns 204', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
    expect(res.status).toBe(204)
  })

  it('GET /api/tasks returns task list', async () => {
    vi.mocked(container.listTasks.execute).mockResolvedValue([mockTask])
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
    expect(container.listTasks.execute).toHaveBeenCalledWith('user123')
    expect(await res.json()).toEqual([mockTask])
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
