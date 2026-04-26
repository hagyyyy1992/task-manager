import { randomUUID } from 'crypto'
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
  loadCategories,
  createCategory,
  updateCategory,
  deleteCategory,
  seedDefaultCategories,
  CategoryProtectedError,
  CategoryDuplicateError,
} from './db.js'
import type { Task } from './db.js'
import { hashPassword, verifyPassword, createToken, verifyToken } from './auth.js'
import { corsHeaders } from './cors.js'

interface LambdaEvent {
  requestContext: { http: { method: string } }
  rawPath: string
  headers?: Record<string, string>
  body?: string
  isBase64Encoded?: boolean
}

function parseBody(event: LambdaEvent): unknown {
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body ?? '', 'base64').toString()
    : (event.body ?? '')
  return raw ? JSON.parse(raw) : {}
}

function generateId(): string {
  return randomUUID()
}

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPrismaUniqueViolationOnName(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err.code !== 'P2002') return false
  const target = err.meta?.target
  // target は string[] のことが多いが、PG では文字列のことも
  if (Array.isArray(target)) return target.includes('name')
  if (typeof target === 'string') return target.includes('name')
  // target が無い場合は安全側で true（Category 唯一の unique 制約は (userId, name)）
  return target === undefined
}

function getToken(event: LambdaEvent): string | null {
  const auth = event.headers?.authorization || event.headers?.Authorization
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

export const handler = async (event: LambdaEvent) => {
  const method = event.requestContext.http.method
  const path = event.rawPath
  const origin = event.headers?.origin ?? event.headers?.Origin
  const headers = {
    'Content-Type': 'application/json',
    ...corsHeaders(origin),
  }

  if (method === 'OPTIONS') {
    return { statusCode: 204, headers, body: '' }
  }

  try {
    // ─── Auth endpoints (public) ──────────────────────────────────────

    // POST /api/auth/register
    if (path === '/api/auth/register' && method === 'POST') {
      if (process.env.ALLOW_REGISTRATION !== 'true') {
        return {
          statusCode: 403,
          headers,
          body: JSON.stringify({ error: '新規登録は現在受け付けていません' }),
        }
      }

      const { email, password, name, termsAgreed } = parseBody(event) as {
        email: string
        password: string
        name: string
        termsAgreed?: boolean
      }

      if (!email || !password || !name) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'email, password, name are required' }),
        }
      }
      if (password.length < 8) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'password must be at least 8 characters' }),
        }
      }
      if (!termsAgreed) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: '利用規約への同意が必要です' }),
        }
      }

      const existing = await findUserByEmail(email)
      if (existing) {
        return {
          statusCode: 409,
          headers,
          body: JSON.stringify({ error: 'email already registered' }),
        }
      }

      const id = generateId()
      const passwordHash = await hashPassword(password)
      const termsAgreedAt = new Date().toISOString()
      const user = await createUser(id, email, name, passwordHash, termsAgreedAt)
      await seedDefaultCategories(user.id)
      const token = await createToken(user.id)

      return { statusCode: 201, headers, body: JSON.stringify({ user, token }) }
    }

    // POST /api/auth/login
    if (path === '/api/auth/login' && method === 'POST') {
      const { email, password } = parseBody(event) as { email: string; password: string }

      if (!email || !password) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'email and password are required' }),
        }
      }

      const userRow = await findUserByEmail(email)
      if (!userRow) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }),
        }
      }

      const valid = await verifyPassword(password, userRow.password_hash)
      if (!valid) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }),
        }
      }

      const token = await createToken(userRow.id)
      const user = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      }

      return { statusCode: 200, headers, body: JSON.stringify({ user, token }) }
    }

    // ─── Protected endpoints ──────────────────────────────────────────

    const token = getToken(event)
    if (!token) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'authentication required' }),
      }
    }

    const userId = await verifyToken(token)
    if (!userId) {
      return {
        statusCode: 401,
        headers,
        body: JSON.stringify({ error: 'invalid or expired token' }),
      }
    }

    // GET /api/auth/me
    if (path === '/api/auth/me' && method === 'GET') {
      const user = await findUserById(userId)
      if (!user) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'user not found' }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify(user) }
    }

    // PATCH /api/auth/password
    if (path === '/api/auth/password' && method === 'PATCH') {
      const { currentPassword, newPassword } = parseBody(event) as {
        currentPassword: string
        newPassword: string
      }

      if (!currentPassword || !newPassword) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'currentPassword and newPassword are required' }),
        }
      }
      if (newPassword.length < 8) {
        return {
          statusCode: 400,
          headers,
          body: JSON.stringify({ error: 'new password must be at least 8 characters' }),
        }
      }

      const userRow = await findUserByEmail((await findUserById(userId))!.email)
      if (!userRow) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'user not found' }) }
      }

      const valid = await verifyPassword(currentPassword, userRow.password_hash)
      if (!valid) {
        return {
          statusCode: 401,
          headers,
          body: JSON.stringify({ error: 'current password is incorrect' }),
        }
      }

      const newHash = await hashPassword(newPassword)
      await updateUserPassword(userId, newHash)

      return { statusCode: 200, headers, body: JSON.stringify({ message: 'password updated' }) }
    }

    // DELETE /api/auth/account
    if (path === '/api/auth/account' && method === 'DELETE') {
      const deleted = await deleteUser(userId)
      if (!deleted) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'user not found' }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify({ message: 'account deleted' }) }
    }

    // ─── Categories ───────────────────────────────────────────────────

    // GET /api/categories
    if (path === '/api/categories' && method === 'GET') {
      const categories = await loadCategories(userId)
      return { statusCode: 200, headers, body: JSON.stringify(categories) }
    }

    // POST /api/categories
    if (path === '/api/categories' && method === 'POST') {
      const { name, sortOrder } = parseBody(event) as { name: string; sortOrder?: number }
      if (!name || !name.trim()) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) }
      }
      if (sortOrder !== undefined && !isValidSortOrder(sortOrder)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid sortOrder' }) }
      }
      const category = await createCategory(userId, name.trim(), sortOrder)
      return { statusCode: 201, headers, body: JSON.stringify(category) }
    }

    // PATCH /api/categories/:id
    const categoryPatchMatch = path.match(/^\/api\/categories\/(.+)$/)
    if (categoryPatchMatch && method === 'PATCH') {
      const id = categoryPatchMatch[1]
      const updates = parseBody(event) as { name?: string; sortOrder?: number }
      const trimmedName = updates.name?.trim()
      if (updates.name !== undefined && !trimmedName) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'name is required' }) }
      }
      if (updates.sortOrder !== undefined && !isValidSortOrder(updates.sortOrder)) {
        return { statusCode: 400, headers, body: JSON.stringify({ error: 'invalid sortOrder' }) }
      }
      try {
        const updated = await updateCategory(id, { ...updates, name: trimmedName }, userId)
        if (!updated) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) }
        }
        return { statusCode: 200, headers, body: JSON.stringify(updated) }
      } catch (e: unknown) {
        if (e instanceof CategoryProtectedError) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) }
        }
        if (e instanceof CategoryDuplicateError || isPrismaUniqueViolationOnName(e)) {
          return {
            statusCode: 409,
            headers,
            body: JSON.stringify({ error: '同じ名前のカテゴリが既に存在します' }),
          }
        }
        throw e
      }
    }

    // DELETE /api/categories/:id
    const categoryDeleteMatch = path.match(/^\/api\/categories\/(.+)$/)
    if (categoryDeleteMatch && method === 'DELETE') {
      const id = categoryDeleteMatch[1]
      try {
        const deleted = await deleteCategory(id, userId)
        if (!deleted) {
          return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) }
        }
        return { statusCode: 200, headers, body: JSON.stringify({ message: 'deleted' }) }
      } catch (e: unknown) {
        if (e instanceof CategoryProtectedError) {
          return { statusCode: 400, headers, body: JSON.stringify({ error: e.message }) }
        }
        throw e
      }
    }

    // ─── Tasks ────────────────────────────────────────────────────────

    // GET /api/tasks
    if (path === '/api/tasks' && method === 'GET') {
      const tasks = await loadTasks({ userId })
      return { statusCode: 200, headers, body: JSON.stringify(tasks) }
    }

    // POST /api/tasks
    if (path === '/api/tasks' && method === 'POST') {
      const task = parseBody(event) as Task
      await createTask(task, userId)
      return { statusCode: 201, headers, body: JSON.stringify(task) }
    }

    // PATCH /api/tasks/:id
    const patchMatch = path.match(/^\/api\/tasks\/(.+)$/)
    if (patchMatch && method === 'PATCH') {
      const id = patchMatch[1]
      const updates = parseBody(event) as Partial<
        Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate' | 'category'>
      >
      const updated = await updateTask(id, updates, userId)
      if (!updated) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify(updated) }
    }

    // DELETE /api/tasks/:id
    const deleteMatch = path.match(/^\/api\/tasks\/(.+)$/)
    if (deleteMatch && method === 'DELETE') {
      const id = deleteMatch[1]
      const deleted = await deleteTask(id, userId)
      if (!deleted) {
        return { statusCode: 404, headers, body: JSON.stringify({ error: 'not found' }) }
      }
      return { statusCode: 200, headers, body: JSON.stringify(deleted) }
    }

    return { statusCode: 404, headers, body: '' }
  } catch (e) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: String(e) }),
    }
  }
}
