import { describe, it, expect, vi, beforeEach } from 'vitest'
import type { Task } from './db.js'

vi.mock('./db.js', () => {
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

vi.mock('./auth.js', () => ({
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
} from './db.js'
import { verifyPassword, verifyToken } from './auth.js'
import { handler } from './handler.js'

const mockTask: Task = {
  id: 'test123',
  title: 'テストタスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null,
  memo: '',
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

function event(
  method: string,
  path: string,
  body?: unknown,
  authenticated = true,
): Parameters<typeof handler>[0] {
  return {
    requestContext: { http: { method } },
    rawPath: path,
    headers: authenticated ? { authorization: 'Bearer test-token' } : {},
    body: body ? JSON.stringify(body) : undefined,
    isBase64Encoded: false,
  }
}

beforeEach(() => {
  vi.clearAllMocks()
  // デフォルトのモック挙動をリセット
  vi.mocked(verifyToken).mockResolvedValue('user123')
  vi.mocked(verifyPassword).mockResolvedValue(true)
  // 登録テストで必要な環境変数を有効化（各describeで上書き可）
  process.env.ALLOW_REGISTRATION = 'true'
})

// ─── CORS テスト ──────────────────────────────────────────────────

describe('CORS', () => {
  function eventWithOrigin(origin: string | undefined) {
    return {
      requestContext: { http: { method: 'OPTIONS' } },
      rawPath: '/api/tasks',
      headers: origin ? { origin } : {},
      isBase64Encoded: false,
    }
  }

  it('allowed origin (localhost) is echoed back', async () => {
    const res = await handler(eventWithOrigin('http://localhost:5173'))
    expect(res.headers['Access-Control-Allow-Origin']).toBe('http://localhost:5173')
    expect(res.headers['Vary']).toBe('Origin')
  })

  it('allowed origin (CloudFront) is echoed back', async () => {
    const res = await handler(eventWithOrigin('https://d3pi0juuilndgb.cloudfront.net'))
    expect(res.headers['Access-Control-Allow-Origin']).toBe('https://d3pi0juuilndgb.cloudfront.net')
  })

  it('disallowed origin is NOT echoed back', async () => {
    const res = await handler(eventWithOrigin('https://evil.example.com'))
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
    expect(res.headers['Vary']).toBe('Origin')
  })

  it('missing origin: no Access-Control-Allow-Origin', async () => {
    const res = await handler(eventWithOrigin(undefined))
    expect(res.headers['Access-Control-Allow-Origin']).toBeUndefined()
  })

  it('ALLOWED_ORIGINS env var overrides default allowlist', async () => {
    process.env.ALLOWED_ORIGINS = 'https://custom.example.com'
    try {
      const res = await handler(eventWithOrigin('https://custom.example.com'))
      expect(res.headers['Access-Control-Allow-Origin']).toBe('https://custom.example.com')

      const res2 = await handler(eventWithOrigin('http://localhost:5173'))
      expect(res2.headers['Access-Control-Allow-Origin']).toBeUndefined()
    } finally {
      delete process.env.ALLOWED_ORIGINS
    }
  })
})

// ─── 既存タスクAPIテスト ──────────────────────────────────────────

describe('task endpoints', () => {
  it('OPTIONS returns 204', async () => {
    const res = await handler(event('OPTIONS', '/api/tasks'))
    expect(res.statusCode).toBe(204)
  })

  it('GET /api/tasks returns task list with userId filter', async () => {
    vi.mocked(loadTasks).mockResolvedValue([mockTask])
    const res = await handler(event('GET', '/api/tasks'))
    expect(res.statusCode).toBe(200)
    expect(loadTasks).toHaveBeenCalledWith({ userId: 'user123' })
    expect(JSON.parse(res.body)).toEqual([mockTask])
  })

  it('POST /api/tasks creates a task with userId', async () => {
    vi.mocked(createTask).mockResolvedValue()
    const res = await handler(event('POST', '/api/tasks', mockTask))
    expect(res.statusCode).toBe(201)
    expect(createTask).toHaveBeenCalledWith(mockTask, 'user123')
  })

  it('PATCH /api/tasks/:id updates a task', async () => {
    const updated = { ...mockTask, status: 'done' as const }
    vi.mocked(updateTask).mockResolvedValue(updated)
    const res = await handler(event('PATCH', '/api/tasks/test123', { status: 'done' }))
    expect(res.statusCode).toBe(200)
    expect(updateTask).toHaveBeenCalledWith('test123', { status: 'done' }, 'user123')
    expect(JSON.parse(res.body).status).toBe('done')
  })

  it('PATCH /api/tasks/:id updates a task category', async () => {
    const updated = { ...mockTask, category: '新カテゴリ' }
    vi.mocked(updateTask).mockResolvedValue(updated)
    const res = await handler(event('PATCH', '/api/tasks/test123', { category: '新カテゴリ' }))
    expect(res.statusCode).toBe(200)
    expect(updateTask).toHaveBeenCalledWith('test123', { category: '新カテゴリ' }, 'user123')
    expect(JSON.parse(res.body).category).toBe('新カテゴリ')
  })

  it('PATCH /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(updateTask).mockResolvedValue(null)
    const res = await handler(event('PATCH', '/api/tasks/unknown', { status: 'done' }))
    expect(res.statusCode).toBe(404)
  })

  it('DELETE /api/tasks/:id deletes a task', async () => {
    vi.mocked(deleteTask).mockResolvedValue(mockTask)
    const res = await handler(event('DELETE', '/api/tasks/test123'))
    expect(res.statusCode).toBe(200)
    expect(deleteTask).toHaveBeenCalledWith('test123', 'user123')
  })

  it('PATCH /api/tasks/:id 他ユーザーのタスクは404（IDOR対策）', async () => {
    vi.mocked(updateTask).mockResolvedValue(null)
    const res = await handler(event('PATCH', '/api/tasks/someone-else-task', { status: 'done' }))
    expect(res.statusCode).toBe(404)
    expect(updateTask).toHaveBeenCalledWith('someone-else-task', { status: 'done' }, 'user123')
  })

  it('DELETE /api/tasks/:id 他ユーザーのタスクは404（IDOR対策）', async () => {
    vi.mocked(deleteTask).mockResolvedValue(null)
    const res = await handler(event('DELETE', '/api/tasks/someone-else-task'))
    expect(res.statusCode).toBe(404)
    expect(deleteTask).toHaveBeenCalledWith('someone-else-task', 'user123')
  })

  it('DELETE /api/tasks/:id returns 404 for unknown id', async () => {
    vi.mocked(deleteTask).mockResolvedValue(null)
    const res = await handler(event('DELETE', '/api/tasks/unknown'))
    expect(res.statusCode).toBe(404)
  })

  it('unknown route returns 404', async () => {
    const res = await handler(event('GET', '/api/unknown'))
    expect(res.statusCode).toBe(404)
  })

  it('handles base64 encoded body', async () => {
    vi.mocked(createTask).mockResolvedValue()
    const body = Buffer.from(JSON.stringify(mockTask)).toString('base64')
    const res = await handler({
      requestContext: { http: { method: 'POST' } },
      rawPath: '/api/tasks',
      headers: { authorization: 'Bearer test-token' },
      body,
      isBase64Encoded: true,
    })
    expect(res.statusCode).toBe(201)
    expect(createTask).toHaveBeenCalledWith(mockTask, 'user123')
  })

  it('returns 500 on db error', async () => {
    vi.mocked(loadTasks).mockRejectedValue(new Error('db down'))
    const res = await handler(event('GET', '/api/tasks'))
    expect(res.statusCode).toBe(500)
    expect(JSON.parse(res.body).error).toContain('db down')
  })
})

// ─── 認証ミドルウェアテスト ──────────────────────────────────────

describe('auth middleware', () => {
  it('returns 401 when no token is provided', async () => {
    const res = await handler(event('GET', '/api/tasks', undefined, false))
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('authentication required')
  })

  it('returns 401 when token is invalid', async () => {
    vi.mocked(verifyToken).mockResolvedValue(null)
    const res = await handler(event('GET', '/api/tasks'))
    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toBe('invalid or expired token')
  })
})

// ─── アカウント登録テスト ────────────────────────────────────────

describe('POST /api/auth/register', () => {
  it('registers a new user with terms agreed', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    vi.mocked(createUser).mockResolvedValue(mockUser)

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(201)
    const body = JSON.parse(res.body)
    expect(body.user.email).toBe('test@example.com')
    expect(body.token).toBe('test-token')
    expect(createUser).toHaveBeenCalled()
  })

  it('seeds default categories for a newly registered user', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)
    vi.mocked(createUser).mockResolvedValue(mockUser)

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(201)
    expect(seedDefaultCategories).toHaveBeenCalledWith(mockUser.id)
    expect(seedDefaultCategories).toHaveBeenCalledTimes(1)
  })

  it('does not seed categories when registration fails', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(409)
    expect(seedDefaultCategories).not.toHaveBeenCalled()
  })

  it('returns 400 when fields are missing', async () => {
    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
        },
        false,
      ),
    )
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when password is too short', async () => {
    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'short',
          name: 'Test',
          termsAgreed: true,
        },
        false,
      ),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('8 characters')
  })

  it('returns 400 when terms are not agreed', async () => {
    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: false,
        },
        false,
      ),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('利用規約')
  })

  it('returns 400 when termsAgreed is missing', async () => {
    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
        },
        false,
      ),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('利用規約')
  })

  it('returns 409 when email is already registered', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toContain('already registered')
  })

  it("returns 403 when ALLOW_REGISTRATION is not 'true'", async () => {
    process.env.ALLOW_REGISTRATION = 'false'

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(403)
    expect(JSON.parse(res.body).error).toContain('受け付けていません')
    expect(createUser).not.toHaveBeenCalled()
    expect(seedDefaultCategories).not.toHaveBeenCalled()
  })

  it('returns 403 when ALLOW_REGISTRATION is unset (fail closed)', async () => {
    delete process.env.ALLOW_REGISTRATION

    const res = await handler(
      event(
        'POST',
        '/api/auth/register',
        {
          email: 'test@example.com',
          password: 'password1234',
          name: 'Test User',
          termsAgreed: true,
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(403)
    expect(createUser).not.toHaveBeenCalled()
  })
})

// ─── ログインテスト ──────────────────────────────────────────────

describe('POST /api/auth/login', () => {
  it('logs in with valid credentials', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)

    const res = await handler(
      event(
        'POST',
        '/api/auth/login',
        {
          email: 'test@example.com',
          password: 'password1234',
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(200)
    const body = JSON.parse(res.body)
    expect(body.user.email).toBe('test@example.com')
    expect(body.token).toBe('test-token')
  })

  it('returns 400 when fields are missing', async () => {
    const res = await handler(
      event(
        'POST',
        '/api/auth/login',
        {
          email: 'test@example.com',
        },
        false,
      ),
    )
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 when user is not found', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(null)

    const res = await handler(
      event(
        'POST',
        '/api/auth/login',
        {
          email: 'unknown@example.com',
          password: 'password1234',
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(401)
  })

  it('returns 401 when password is wrong', async () => {
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await handler(
      event(
        'POST',
        '/api/auth/login',
        {
          email: 'test@example.com',
          password: 'wrongpassword',
        },
        false,
      ),
    )

    expect(res.statusCode).toBe(401)
  })
})

// ─── GET /api/auth/me テスト ─────────────────────────────────────

describe('GET /api/auth/me', () => {
  it('returns current user', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)

    const res = await handler(event('GET', '/api/auth/me'))
    expect(res.statusCode).toBe(200)
    expect(JSON.parse(res.body).email).toBe('test@example.com')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(findUserById).mockResolvedValue(null)

    const res = await handler(event('GET', '/api/auth/me'))
    expect(res.statusCode).toBe(404)
  })
})

// ─── パスワード変更テスト ────────────────────────────────────────

describe('PATCH /api/auth/password', () => {
  it('changes password with valid current password', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(updateUserPassword).mockResolvedValue(true)

    const res = await handler(
      event('PATCH', '/api/auth/password', {
        currentPassword: 'password1234',
        newPassword: 'newpassword5678',
      }),
    )

    expect(res.statusCode).toBe(200)
    expect(updateUserPassword).toHaveBeenCalledWith('user123', 'hashed')
  })

  it('returns 400 when fields are missing', async () => {
    const res = await handler(
      event('PATCH', '/api/auth/password', {
        currentPassword: 'password1234',
      }),
    )
    expect(res.statusCode).toBe(400)
  })

  it('returns 400 when new password is too short', async () => {
    const res = await handler(
      event('PATCH', '/api/auth/password', {
        currentPassword: 'password1234',
        newPassword: 'short',
      }),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('8 characters')
  })

  it('returns 401 when current password is wrong', async () => {
    vi.mocked(findUserById).mockResolvedValue(mockUser)
    vi.mocked(findUserByEmail).mockResolvedValue(mockUserRow)
    vi.mocked(verifyPassword).mockResolvedValue(false)

    const res = await handler(
      event('PATCH', '/api/auth/password', {
        currentPassword: 'wrongpassword',
        newPassword: 'newpassword5678',
      }),
    )

    expect(res.statusCode).toBe(401)
    expect(JSON.parse(res.body).error).toContain('current password')
  })
})

// ─── アカウント削除テスト ────────────────────────────────────────

describe('DELETE /api/auth/account', () => {
  it('deletes account', async () => {
    vi.mocked(deleteUser).mockResolvedValue(true)

    const res = await handler(event('DELETE', '/api/auth/account'))
    expect(res.statusCode).toBe(200)
    expect(deleteUser).toHaveBeenCalledWith('user123')
  })

  it('returns 404 when user not found', async () => {
    vi.mocked(deleteUser).mockResolvedValue(false)

    const res = await handler(event('DELETE', '/api/auth/account'))
    expect(res.statusCode).toBe(404)
  })
})

// ─── カテゴリCRUDテスト ─────────────────────────────────────────

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
    const res = await handler(event('GET', '/api/categories'))
    expect(res.statusCode).toBe(200)
    expect(loadCategoriesWithCounts).toHaveBeenCalledWith('user123')
    expect(JSON.parse(res.body)).toEqual([withCount])
  })

  it('returns 401 without authentication', async () => {
    const res = await handler(event('GET', '/api/categories', undefined, false))
    expect(res.statusCode).toBe(401)
  })
})

describe('POST /api/categories', () => {
  it('creates a category', async () => {
    vi.mocked(createCategory).mockResolvedValue(mockCategory)
    const res = await handler(
      event('POST', '/api/categories', { name: '決算・税務', sortOrder: 0 }),
    )
    expect(res.statusCode).toBe(201)
    expect(createCategory).toHaveBeenCalledWith('user123', '決算・税務', 0)
    expect(JSON.parse(res.body)).toEqual(mockCategory)
  })

  it('returns 400 when name is missing', async () => {
    const res = await handler(event('POST', '/api/categories', { name: '' }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('name is required')
  })

  it('returns 400 when name is whitespace only', async () => {
    const res = await handler(event('POST', '/api/categories', { name: '   ' }))
    expect(res.statusCode).toBe(400)
  })

  it('returns 401 without authentication', async () => {
    const res = await handler(event('POST', '/api/categories', { name: 'テスト' }, false))
    expect(res.statusCode).toBe(401)
  })
})

describe('PATCH /api/categories/:id', () => {
  it('updates a category', async () => {
    const updated = { ...mockCategory, name: '更新済み' }
    vi.mocked(updateCategory).mockResolvedValue(updated)
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: '更新済み' }))
    expect(res.statusCode).toBe(200)
    expect(updateCategory).toHaveBeenCalledWith('cat123', { name: '更新済み' }, 'user123')
    expect(JSON.parse(res.body).name).toBe('更新済み')
  })

  it('returns 404 for unknown id', async () => {
    vi.mocked(updateCategory).mockResolvedValue(null)
    const res = await handler(event('PATCH', '/api/categories/unknown', { name: 'test' }))
    expect(res.statusCode).toBe(404)
  })

  it('returns 401 without authentication', async () => {
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: 'test' }, false))
    expect(res.statusCode).toBe(401)
  })

  it('他ユーザーのカテゴリは404（IDOR対策）', async () => {
    vi.mocked(updateCategory).mockResolvedValue(null)
    const res = await handler(event('PATCH', '/api/categories/someone-else-cat', { name: 'steal' }))
    expect(res.statusCode).toBe(404)
    expect(updateCategory).toHaveBeenCalledWith('someone-else-cat', { name: 'steal' }, 'user123')
  })
})

describe('DELETE /api/categories/:id', () => {
  it('deletes a category', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(true)
    const res = await handler(event('DELETE', '/api/categories/cat123'))
    expect(res.statusCode).toBe(200)
    expect(deleteCategory).toHaveBeenCalledWith('cat123', 'user123')
  })

  it('他ユーザーのカテゴリは404（IDOR対策）', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(false)
    const res = await handler(event('DELETE', '/api/categories/someone-else-cat'))
    expect(res.statusCode).toBe(404)
    expect(deleteCategory).toHaveBeenCalledWith('someone-else-cat', 'user123')
  })

  it('returns 404 for unknown id', async () => {
    vi.mocked(deleteCategory).mockResolvedValue(false)
    const res = await handler(event('DELETE', '/api/categories/unknown'))
    expect(res.statusCode).toBe(404)
  })

  it('「その他」カテゴリ削除は400を返す', async () => {
    vi.mocked(deleteCategory).mockRejectedValue(new CategoryProtectedError())
    const res = await handler(event('DELETE', '/api/categories/cat-sonota'))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('その他')
  })

  it('returns 401 without authentication', async () => {
    const res = await handler(event('DELETE', '/api/categories/cat123', undefined, false))
    expect(res.statusCode).toBe(401)
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
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: '既存名' }))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toContain('既に存在')
  })

  it('name 以外の P2002 は 500 にフォールバックする', async () => {
    vi.mocked(updateCategory).mockRejectedValue(
      Object.assign(new Error('Unique constraint failed'), {
        code: 'P2002',
        meta: { target: ['some_other_unique'] },
      }),
    )
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: 'foo' }))
    expect(res.statusCode).toBe(500)
  })

  it('空文字nameは400を返す', async () => {
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: '   ' }))
    expect(res.statusCode).toBe(400)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('不正なsortOrderは400を返す', async () => {
    const res = await handler(
      event('PATCH', '/api/categories/cat123', { sortOrder: 'not-a-number' }),
    )
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('sortOrder')
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('負のsortOrderは400を返す', async () => {
    const res = await handler(event('PATCH', '/api/categories/cat123', { sortOrder: -1 }))
    expect(res.statusCode).toBe(400)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('CategoryDuplicateError は 409 を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(new CategoryDuplicateError())
    const res = await handler(event('PATCH', '/api/categories/cat123', { name: '既存名' }))
    expect(res.statusCode).toBe(409)
    expect(JSON.parse(res.body).error).toContain('既に存在')
  })

  it('「その他」のリネームは400を返す', async () => {
    vi.mocked(updateCategory).mockRejectedValue(
      new CategoryProtectedError('「その他」カテゴリの名前は変更できません'),
    )
    const res = await handler(event('PATCH', '/api/categories/cat-sonota', { name: 'ゴミ箱' }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('その他')
  })
})

describe('PATCH /api/categories/reorder', () => {
  it('並び替えに成功すると200と更新後一覧を返す', async () => {
    const reordered = [
      { ...mockCategory, id: 'b', sortOrder: 0 },
      { ...mockCategory, id: 'a', sortOrder: 1 },
    ]
    vi.mocked(reorderCategories).mockResolvedValue(reordered)
    const res = await handler(event('PATCH', '/api/categories/reorder', { ids: ['b', 'a'] }))
    expect(res.statusCode).toBe(200)
    expect(reorderCategories).toHaveBeenCalledWith('user123', ['b', 'a'])
    expect(JSON.parse(res.body)).toEqual(reordered)
    expect(updateCategory).not.toHaveBeenCalled()
  })

  it('ids が配列でない場合は400', async () => {
    const res = await handler(event('PATCH', '/api/categories/reorder', { ids: 'not-array' }))
    expect(res.statusCode).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('ids に文字列以外が混ざっていれば400', async () => {
    const res = await handler(event('PATCH', '/api/categories/reorder', { ids: ['a', 1] }))
    expect(res.statusCode).toBe(400)
    expect(reorderCategories).not.toHaveBeenCalled()
  })

  it('CategoryReorderError は400を返す', async () => {
    vi.mocked(reorderCategories).mockRejectedValue(
      new CategoryReorderError('全カテゴリのIDを過不足なく指定してください'),
    )
    const res = await handler(event('PATCH', '/api/categories/reorder', { ids: ['a'] }))
    expect(res.statusCode).toBe(400)
    expect(JSON.parse(res.body).error).toContain('過不足')
  })

  it('returns 401 without authentication', async () => {
    const res = await handler(event('PATCH', '/api/categories/reorder', { ids: ['a'] }, false))
    expect(res.statusCode).toBe(401)
  })
})
