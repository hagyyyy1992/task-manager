import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from './lib/db.js'

vi.mock('./lib/db.js', () => {
  class CategoryProtectedError extends Error {
    constructor(message = '「その他」カテゴリは削除できません') {
      super(message)
      this.name = 'CategoryProtectedError'
    }
  }
  class CategoryDuplicateError extends Error {
    constructor(message = '同じ名前のカテゴリが既に存在します') {
      super(message)
      this.name = 'CategoryDuplicateError'
    }
  }
  class CategoryReorderError extends Error {
    constructor(message: string) {
      super(message)
      this.name = 'CategoryReorderError'
    }
  }
  return {
    loadTasks: vi.fn(),
    createTask: vi.fn(),
    updateTask: vi.fn(),
    deleteTask: vi.fn(),
    findUserByEmail: vi.fn(),
    findUserById: vi.fn(),
    createUser: vi.fn(),
    updateUserPassword: vi.fn(),
    deleteUser: vi.fn(),
    loadCategoriesWithCounts: vi.fn(),
    createCategory: vi.fn(),
    updateCategory: vi.fn(),
    deleteCategory: vi.fn(),
    reorderCategories: vi.fn(),
    seedDefaultCategories: vi.fn(),
    CategoryProtectedError,
    CategoryDuplicateError,
    CategoryReorderError,
  }
})

vi.mock('./lib/auth.js', () => ({
  hashPassword: vi.fn().mockResolvedValue('hashed'),
  verifyPassword: vi.fn().mockResolvedValue(true),
  createToken: vi.fn().mockResolvedValue('test-token'),
  verifyToken: vi.fn().mockResolvedValue('user123'),
}))

import {
  loadTasks,
  createTask,
  updateTask,
  deleteTask,
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPassword,
  deleteUser,
  loadCategoriesWithCounts,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  seedDefaultCategories,
  CategoryProtectedError,
  CategoryDuplicateError,
  CategoryReorderError,
} from './lib/db.js'
import { verifyPassword, verifyToken } from './lib/auth.js'
import { buildApp } from './index.js'

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

const mockUserRow = {
  ...mockUser,
  password_hash: 'salt:hash',
  created_at: mockUser.createdAt,
  updated_at: mockUser.updatedAt,
}

const BASE = 'http://localhost'

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
  const app = buildApp()
  return app.fetch(
    new Request(`${BASE}${path}`, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  )
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(verifyToken).mockResolvedValue('user123')
  vi.mocked(verifyPassword).mockResolvedValue(true)
  process.env.ALLOW_REGISTRATION = 'true'
})

// ─── CORS テスト ──────────────────────────────────────────────────

describe('CORS', () => {
  it('allowed origin (localhost) is echoed back', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
    expect(res.headers.get('access-control-allow-origin')).toBe('http://localhost:5173')
    expect(res.headers.get('vary')?.toLowerCase()).toContain('origin')
  })

  it('allowed origin (CloudFront) is echoed back', async () => {
    const res = await req('/api/tasks', {
      method: 'OPTIONS',
      origin: 'https://d3pi0juuilndgb.cloudfront.net',
    })
    expect(res.headers.get('access-control-allow-origin')).toBe(
      'https://d3pi0juuilndgb.cloudfront.net',
    )
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

      const res2 = await req('/api/tasks', {
        method: 'OPTIONS',
        origin: 'http://localhost:5173',
      })
      expect(res2.headers.get('access-control-allow-origin')).toBeNull()
    } finally {
      delete process.env.ALLOWED_ORIGINS
    }
  })
})

// ─── タスクAPI ────────────────────────────────────────────────────

describe('task endpoints', () => {
  it('OPTIONS returns 204', async () => {
    const res = await req('/api/tasks', { method: 'OPTIONS', origin: 'http://localhost:5173' })
    expect(res.status).toBe(204)
  })

  it('GET /api/tasks returns task list with userId filter', async () => {
    vi.mocked(loadTasks).mockResolvedValue([mockTask])
    const res = await req('/api/tasks')
    expect(res.status).toBe(200)
    expect(loadTasks).toHaveBeenCalledWith({ userId: 'user123' })
    expect(await res.json()).toEqual([mockTask])
  })

  it('POST /api/tasks creates a task with userId', async () => {
    vi.mocked(createTask).mockResolvedValue()
    const res = await req('/api/tasks', { method: 'POST', body: mockTask })
    expect(res.status).toBe(201)
    expect(createTask).toHaveBeenCalledWith(mockTask, 'user123')
  })

  it('PATCH /api/tasks/:id updates a task', async () => {
    const updated = { ...mockTask, status: 'done' as const }
    vi.mocked(updateTask).mockResolvedValue(updated)
    const res = await req('/api/tasks/test123', { method: 'PATCH', body: { status: 'done' } })
    expect(res.status).toBe(200)
    expect(updateTask).toHaveBeenCalledWith('test123', { status: 'done' }, 'user123')
    expect((await res.json()).status).toBe('done')
  })

  it('PATCH /api/tasks/:id updates a task category', async () => {
    const updated = { ...mockTask, category: '新カテゴリ' }
    vi.mocked(updateTask).mockResolvedValue(updated)
    const res = await req('/api/tasks/test123', {
      method: 'PATCH',
      body: { category: '新カテゴリ' },
    })
    expect(res.status).toBe(200)
    expect(updateTask).toHaveBeenCalledWith('test123', { category: '新カテゴリ' }, 'user123')
    expect((await res.json()).category).toBe('新カテゴリ')
  })

  it('PATCH /api/tasks/:id pinned を更新できる', async () => {
    const updated = { ...mockTask, pinned: true }
    vi.mocked(updateTask).mockResolvedValue(updated)
    const res = await req('/api/tasks/test123', { method: 'PATCH', body: { pinned: true } })
    expect(res.status).toBe(200)
    expect(updateTask).toHaveBeenCalledWith('test123', { pinned: true }, 'user123')
    expect((await res.json()).pinned).toBe(true)
  })

  it('PATCH /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(updateTask).mockResolvedValue(null)
    const res = await req('/api/tasks/unknown', { method: 'PATCH', body: { status: 'done' } })
    expect(res.status).toBe(404)
  })

  it('DELETE /api/tasks/:id deletes a task', async () => {
    vi.mocked(deleteTask).mockResolvedValue(mockTask)
    const res = await req('/api/tasks/test123', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(deleteTask).toHaveBeenCalledWith('test123', 'user123')
  })

  it('PATCH /api/tasks/:id 他ユーザーのタスクは404（IDOR対策）', async () => {
    vi.mocked(updateTask).mockResolvedValue(null)
    const res = await req('/api/tasks/someone-else-task', {
      method: 'PATCH',
      body: { status: 'done' },
    })
    expect(res.status).toBe(404)
    expect(updateTask).toHaveBeenCalledWith('someone-else-task', { status: 'done' }, 'user123')
  })

  it('DELETE /api/tasks/:id 他ユーザーのタスクは404（IDOR対策）', async () => {
    vi.mocked(deleteTask).mockResolvedValue(null)
    const res = await req('/api/tasks/someone-else-task', { method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(deleteTask).toHaveBeenCalledWith('someone-else-task', 'user123')
  })

  it('DELETE /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(deleteTask).mockResolvedValue(null)
    const res = await req('/api/tasks/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('unknown route returns 404', async () => {
    const res = await req('/api/unknown')
    expect(res.status).toBe(404)
  })

  it('returns 500 on db error', async () => {
    vi.mocked(loadTasks).mockRejectedValue(new Error('db down'))
    const res = await req('/api/tasks')
    expect(res.status).toBe(500)
    expect((await res.json()).error).toContain('db down')
  })
})

// ─── 認証ミドルウェア ────────────────────────────────────────────

describe('auth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await req('/api/tasks', { authenticated: false })
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('authentication required')
  })

  it('returns 401 when token is invalid', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null)
    const res = await req('/api/tasks')
    expect(res.status).toBe(401)
    expect((await res.json()).error).toBe('invalid or expired token')
  })
})

// ─── アカウント登録 ──────────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('registers a new user with terms agreed', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    vi.mocked(createUser).mockResolvedValue(mockUser)

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(201)
    const body = await res.json()
    expect(body.user.email).toBe('test@example.com')
    expect(body.token).toBe('test-token')
    expect(createUser).toHaveBeenCalled()
  })

  it('seeds default categories for a newly registered user', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    vi.mocked(createUser).mockResolvedValue(mockUser)

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(201)
    expect(seedDefaultCategories).toHaveBeenCalledWith(mockUser.id)
    expect(seedDefaultCategories).toHaveBeenCalledTimes(1)
  })

  it('does not seed categories when registration fails', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(409)
    expect(seedDefaultCategories).not.toHaveBeenCalled()
  })

  it('returns 400 when fields are missing', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: { email: 'test@example.com' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when password is too short', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'short',
        name: 'Test',
        termsAgreed: true,
      },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('8 characters')
  })

  it('returns 400 when terms are not agreed', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: false,
      },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('利用規約')
  })

  it('returns 400 when termsAgreed is missing', async () => {
    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
      },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('利用規約')
  })

  it('returns 409 when email is already registered', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('already registered')
  })

  it("returns 403 when ALLOW_REGISTRATION is not 'true'", async () => {
    process.env.ALLOW_REGISTRATION = 'false'

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(403)
    expect((await res.json()).error).toContain('受け付けていません')
    expect(createUser).not.toHaveBeenCalled()
    expect(seedDefaultCategories).not.toHaveBeenCalled()
  })

  it('returns 403 when ALLOW_REGISTRATION is unset (fail closed)', async () => {
    delete process.env.ALLOW_REGISTRATION

    const res = await req('/api/auth/register', {
      method: 'POST',
      authenticated: false,
      body: {
        email: 'test@example.com',
        password: 'password1234',
        name: 'Test User',
        termsAgreed: true,
      },
    })

    expect(res.status).toBe(403)
    expect(createUser).not.toHaveBeenCalled()
  })
})

// ─── ログイン ────────────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'test@example.com', password: 'password1234' },
    })

    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.user.email).toBe('test@example.com')
    expect(body.token).toBe('test-token')
  })

  it('returns 400 when fields are missing', async () => {
    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'test@example.com' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 401 when user is not found', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'unknown@example.com', password: 'password1234' },
    })
    expect(res.status).toBe(401)
  })

  it('returns 401 when password is wrong', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await req('/api/auth/login', {
      method: 'POST',
      authenticated: false,
      body: { email: 'test@example.com', password: 'wrongpassword' },
    })
    expect(res.status).toBe(401)
  })
})

// ─── /api/auth/me ────────────────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns current user', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    const res = await req('/api/auth/me')
    expect(res.status).toBe(200)
    expect((await res.json()).email).toBe('test@example.com')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(findUserById).mockResolvedValue(null)
    const res = await req('/api/auth/me')
    expect(res.status).toBe(404)
  })
})

// ─── パスワード変更 ──────────────────────────────────────────────

describe('PATCH /api/auth/password', () => {
  it('changes password with valid current password', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(updateUserPassword).mockResolvedValue(true)

    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234', newPassword: 'newpassword5678' },
    })

    expect(res.status).toBe(200)
    expect(updateUserPassword).toHaveBeenCalledWith('user123', 'hashed')
  })

  it('returns 400 when fields are missing', async () => {
    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234' },
    })
    expect(res.status).toBe(400)
  })

  it('returns 400 when new password is too short', async () => {
    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234', newPassword: 'short' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('8 characters')
  })

  it('returns 401 when current password is wrong', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'wrongpassword', newPassword: 'newpassword5678' },
    })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toContain('current password')
  })

  it('returns 404 when findUserByEmail returns null（findUserById は通過したが email から引けない）', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    vi.mocked(findUserByEmail).mockResolvedValue(null)

    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234', newPassword: 'newpassword5678' },
    })

    expect(res.status).toBe(404)
    expect((await res.json()).error).toContain('user not found')
  })

  it('returns 401 when findUserById returns null (token は通過したが DB に user 無し)', async () => {
    vi.mocked(findUserById).mockResolvedValue(null)

    const res = await req('/api/auth/password', {
      method: 'PATCH',
      body: { currentPassword: 'password1234', newPassword: 'newpassword5678' },
    })

    expect(res.status).toBe(401)
    expect((await res.json()).error).toContain('unauthorized')
  })
})

// ─── アカウント削除 ──────────────────────────────────────────────

describe('DELETE /api/auth/account', () => {
  it('deletes account', async () => {
    vi.mocked(deleteUser).mockResolvedValue(true)
    const res = await req('/api/auth/account', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(deleteUser).toHaveBeenCalledWith('user123')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(deleteUser).mockResolvedValue(false)
    const res = await req('/api/auth/account', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })
})

// ─── カテゴリCRUD ────────────────────────────────────────────────

const mockCategory = {
  id: 'cat123',
  userId: 'user123',
  name: '決算・税務',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

describe('GET /api/categories', () => {
  it('returns category list with taskCount for authenticated user', async () => {
    const withCount = { ...mockCategory, taskCount: 3 }
    vi.mocked(loadCategoriesWithCounts).mockResolvedValue([withCount])
    const res = await req('/api/categories')
    expect(res.status).toBe(200)
    expect(loadCategoriesWithCounts).toHaveBeenCalledWith('user123')
    expect(await res.json()).toEqual([withCount])
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories', { authenticated: false })
    expect(res.status).toBe(401)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    vi.mocked(createCategory).mockResolvedValue(mockCategory)
    const res = await req('/api/categories', {
      method: 'POST',
      body: { name: '決算・税務', sortOrder: 0 },
    })
    expect(res.status).toBe(201)
    expect(createCategory).toHaveBeenCalledWith('user123', '決算・税務', 0)
    expect(await res.json()).toEqual(mockCategory)
  })

  it('returns 400 when name is missing', async () => {
    const res = await req('/api/categories', { method: 'POST', body: { name: '' } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('name is required')
  })

  it('returns 400 when name is whitespace only', async () => {
    const res = await req('/api/categories', { method: 'POST', body: { name: '   ' } })
    expect(res.status).toBe(400)
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories', {
      method: 'POST',
      body: { name: 'テスト' },
      authenticated: false,
    })
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/categories/:id', () => {
  it('updates a category', async () => {
    const updated = { ...mockCategory, name: '更新済み' }
    vi.mocked(updateCategory).mockResolvedValue(updated)
    const res = await req('/api/categories/cat123', {
      method: 'PATCH',
      body: { name: '更新済み' },
    })
    expect(res.status).toBe(200)
    expect(updateCategory).toHaveBeenCalledWith('cat123', { name: '更新済み' }, 'user123')
    expect((await res.json()).name).toBe('更新済み')
  })

  it('returns 404 for unknown id', async () => {
    vi.mocked(updateCategory).mockResolvedValue(null)
    const res = await req('/api/categories/unknown', { method: 'PATCH', body: { name: 'test' } })
    expect(res.status).toBe(404)
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories/cat123', {
      method: 'PATCH',
      body: { name: 'test' },
      authenticated: false,
    })
    expect(res.status).toBe(401)
  })

  it('他ユーザーのカテゴリは404（IDOR対策）', async () => {
    vi.mocked(updateCategory).mockResolvedValue(null)
    const res = await req('/api/categories/someone-else-cat', {
      method: 'PATCH',
      body: { name: 'steal' },
    })
    expect(res.status).toBe(404)
    expect(updateCategory).toHaveBeenCalledWith('someone-else-cat', { name: 'steal' }, 'user123')
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes a category', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(true)
    const res = await req('/api/categories/cat123', { method: 'DELETE' })
    expect(res.status).toBe(200)
    expect(deleteCategory).toHaveBeenCalledWith('cat123', 'user123')
  })

  it('他ユーザーのカテゴリは404（IDOR対策）', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(false)
    const res = await req('/api/categories/someone-else-cat', { method: 'DELETE' })
    expect(res.status).toBe(404)
    expect(deleteCategory).toHaveBeenCalledWith('someone-else-cat', 'user123')
  })

  it('returns 404 for unknown id', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(false)
    const res = await req('/api/categories/unknown', { method: 'DELETE' })
    expect(res.status).toBe(404)
  })

  it('「その他」カテゴリ削除は400を返す', async () => {
    vi.mocked(deleteCategory).mockRejectedValue(new CategoryProtectedError())
    const res = await req('/api/categories/cat-sonota', { method: 'DELETE' })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('その他')
  })

  it('returns 401 without authentication', async () => {
    const res = await req('/api/categories/cat123', { method: 'DELETE', authenticated: false })
    expect(res.status).toBe(401)
  })
})

describe('PATCH /api/categories/:id (重複名)', () => {
  it('一意制約違反は409を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['userId', 'name'] },
      }),
    )
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: '既存名' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('既に存在')
  })

  it('name 以外の P2002 は 500 にフォールバックする', async () => {
    vi.mocked(updateCategory).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['some_other_unique'] },
      }),
    )
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: 'foo' } })
    expect(res.status).toBe(500)
  })

  it('空文字nameは400を返す', async () => {
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: '   ' } })
    expect(res.status).toBe(400)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('不正なsortOrderは400を返す', async () => {
    const res = await req('/api/categories/cat123', {
      method: 'PATCH',
      body: { sortOrder: 'not-a-number' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('sortOrder')
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('負のsortOrderは400を返す', async () => {
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { sortOrder: -1 } })
    expect(res.status).toBe(400)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('CategoryDuplicateError は 409 を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(new CategoryDuplicateError())
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: '既存名' } })
    expect(res.status).toBe(409)
    expect((await res.json()).error).toContain('既に存在')
  })

  it('「その他」のリネームは400を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(
      new CategoryProtectedError('「その他」カテゴリの名前は変更できません'),
    )
    const res = await req('/api/categories/cat-sonota', {
      method: 'PATCH',
      body: { name: 'ゴミ箱' },
    })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('その他')
  })
})

describe('POST /api/categories (sortOrder validation)', () => {
  it('不正な sortOrder（負数）は 400 を返す', async () => {
    const res = await req('/api/categories', { method: 'POST', body: { name: 'x', sortOrder: -1 } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('sortOrder')
  })

  it('不正な sortOrder（浮動小数）は 400 を返す', async () => {
    const res = await req('/api/categories', {
      method: 'POST',
      body: { name: 'x', sortOrder: 1.5 },
    })
    expect(res.status).toBe(400)
  })

  it('不正な sortOrder（文字列）は 400 を返す', async () => {
    const res = await req('/api/categories', {
      method: 'POST',
      body: { name: 'x', sortOrder: 'one' },
    })
    expect(res.status).toBe(400)
  })
})

describe('handler の例外ハンドリング (5xx)', () => {
  it('PATCH /api/categories/:id で予期せぬ例外は 500 を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(new Error('unknown db error'))
    const res = await req('/api/categories/cat123', { method: 'PATCH', body: { name: 'x' } })
    expect(res.status).toBe(500)
  })

  it('DELETE /api/categories/:id で予期せぬ例外は 500 を返す（CategoryProtectedError 以外）', async () => {
    vi.mocked(deleteCategory).mockRejectedValue(new Error('unknown db error'))
    const res = await req('/api/categories/cat123', { method: 'DELETE' })
    expect(res.status).toBe(500)
  })

  it('PATCH /api/categories/reorder で予期せぬ例外は 500 を返す（CategoryReorderError 以外）', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(new Error('unknown db error'))
    const res = await req('/api/categories/reorder', { method: 'PATCH', body: { ids: ['a'] } })
    expect(res.status).toBe(500)
  })
})

describe('PATCH /api/categories/reorder', () => {
  it('並び替えに成功すると200と更新後一覧を返す', async () => {
    const reordered = [
      { ...mockCategory, id: 'b', sortOrder: 0 },
      { ...mockCategory, id: 'a', sortOrder: 1 },
    ]
    vi.mocked(reorderCategories).mockResolvedValue(reordered)
    const res = await req('/api/categories/reorder', { method: 'PATCH', body: { ids: ['b', 'a'] } })
    expect(res.status).toBe(200)
    expect(reorderCategories).toHaveBeenCalledWith('user123', ['b', 'a'])
    expect(await res.json()).toEqual(reordered)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('ids が配列でない場合は400', async () => {
    const res = await req('/api/categories/reorder', {
      method: 'PATCH',
      body: { ids: 'not-array' },
    })
    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('ids に文字列以外が混ざっていれば400', async () => {
    const res = await req('/api/categories/reorder', {
      method: 'PATCH',
      body: { ids: ['a', 1] },
    })
    expect(res.status).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('CategoryReorderError は400を返す', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(
      new CategoryReorderError('全カテゴリのIDを過不足なく指定してください'),
    )
    const res = await req('/api/categories/reorder', { method: 'PATCH', body: { ids: ['a'] } })
    expect(res.status).toBe(400)
    expect((await res.json()).error).toContain('過不足')
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
