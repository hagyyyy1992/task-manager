import { createServer } from 'http'
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
import type { Task } from './db.js'
import { hashPassword, verifyPassword, createToken, verifyToken } from './auth.js'
import { corsHeaders } from './cors.js'

function readBody(req: import('http').IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let body = ''
    req.on('data', (chunk) => (body += chunk))
    req.on('end', () => resolve(body))
  })
}

function generateId(): string {
  return randomUUID()
}

function getToken(req: import('http').IncomingMessage): string | null {
  const auth = req.headers.authorization
  if (!auth?.startsWith('Bearer ')) return null
  return auth.slice(7)
}

const server = createServer(async (req, res) => {
  for (const [key, value] of Object.entries(corsHeaders(req.headers.origin))) {
    res.setHeader(key, value)
  }

  if (req.method === 'OPTIONS') {
    res.writeHead(204)
    res.end()
    return
  }

  const url = req.url ?? ''

  try {
    // ─── Auth endpoints (public) ──────────────────────────────────────

    // POST /api/auth/register
    if (url === '/api/auth/register' && req.method === 'POST') {
      if (process.env.ALLOW_REGISTRATION !== 'true') {
        res.writeHead(403, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '新規登録は現在受け付けていません' }))
        return
      }

      const { email, password, name, termsAgreed } = JSON.parse(await readBody(req))

      if (!email || !password || !name) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'email, password, name are required' }))
        return
      }
      if (password.length < 8) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'password must be at least 8 characters' }))
        return
      }
      if (!termsAgreed) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: '利用規約への同意が必要です' }))
        return
      }

      const existing = await findUserByEmail(email)
      if (existing) {
        res.writeHead(409, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'email already registered' }))
        return
      }

      const id = generateId()
      const passwordHash = await hashPassword(password)
      const termsAgreedAt = new Date().toISOString()
      const user = await createUser(id, email, name, passwordHash, termsAgreedAt)
      await seedDefaultCategories(user.id)
      const token = await createToken(user.id)

      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ user, token }))
      return
    }

    // POST /api/auth/login
    if (url === '/api/auth/login' && req.method === 'POST') {
      const { email, password } = JSON.parse(await readBody(req))

      if (!email || !password) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'email and password are required' }))
        return
      }

      const userRow = await findUserByEmail(email)
      if (!userRow) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }))
        return
      }

      const valid = await verifyPassword(password, userRow.password_hash)
      if (!valid) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'メールアドレスまたはパスワードが正しくありません' }))
        return
      }

      const token = await createToken(userRow.id)
      const user = {
        id: userRow.id,
        email: userRow.email,
        name: userRow.name,
        createdAt: userRow.created_at,
        updatedAt: userRow.updated_at,
      }

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ user, token }))
      return
    }

    // ─── Protected endpoints ──────────────────────────────────────────

    const token = getToken(req)
    if (!token) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'authentication required' }))
      return
    }

    const userId = await verifyToken(token)
    if (!userId) {
      res.writeHead(401, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'invalid or expired token' }))
      return
    }

    // GET /api/auth/me
    if (url === '/api/auth/me' && req.method === 'GET') {
      const user = await findUserById(userId)
      if (!user) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'user not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(user))
      return
    }

    // PATCH /api/auth/password
    if (url === '/api/auth/password' && req.method === 'PATCH') {
      const { currentPassword, newPassword } = JSON.parse(await readBody(req))

      if (!currentPassword || !newPassword) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'currentPassword and newPassword are required' }))
        return
      }
      if (newPassword.length < 8) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'new password must be at least 8 characters' }))
        return
      }

      const me = await findUserById(userId)
      if (!me) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'unauthorized' }))
        return
      }
      const userRow = await findUserByEmail(me.email)
      if (!userRow) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'user not found' }))
        return
      }

      const valid = await verifyPassword(currentPassword, userRow.password_hash)
      if (!valid) {
        res.writeHead(401, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'current password is incorrect' }))
        return
      }

      const newHash = await hashPassword(newPassword)
      await updateUserPassword(userId, newHash)

      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'password updated' }))
      return
    }

    // DELETE /api/auth/account
    if (url === '/api/auth/account' && req.method === 'DELETE') {
      const deleted = await deleteUser(userId)
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'user not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ message: 'account deleted' }))
      return
    }

    // ─── Categories ───────────────────────────────────────────────────

    // GET /api/categories
    if (url === '/api/categories' && req.method === 'GET') {
      const categories = await loadCategoriesWithCounts(userId)
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(categories))
      return
    }

    // POST /api/categories
    if (url === '/api/categories' && req.method === 'POST') {
      const { name, sortOrder } = JSON.parse(await readBody(req))
      if (!name || !name.trim()) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'name is required' }))
        return
      }
      const category = await createCategory(userId, name.trim(), sortOrder)
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(category))
      return
    }

    // PATCH /api/categories/reorder  (must come before /api/categories/:id)
    if (url === '/api/categories/reorder' && req.method === 'PATCH') {
      const body = await readBody(req)
      const parsed = JSON.parse(body) as { ids?: unknown }
      if (!Array.isArray(parsed.ids) || !parsed.ids.every((x) => typeof x === 'string')) {
        res.writeHead(400, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'ids must be string[]' }))
        return
      }
      try {
        const updated = await reorderCategories(userId, parsed.ids as string[])
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(updated))
      } catch (e: unknown) {
        if (e instanceof CategoryReorderError) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
          return
        }
        throw e
      }
      return
    }

    // PATCH /api/categories/:id
    const categoryPatchMatch = url.match(/^\/api\/categories\/(.+)$/)
    if (categoryPatchMatch && req.method === 'PATCH') {
      const body = await readBody(req)
      const updates = JSON.parse(body)
      try {
        const updated = await updateCategory(categoryPatchMatch[1], updates, userId)
        if (!updated) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'not found' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(updated))
      } catch (e: unknown) {
        if (e instanceof CategoryProtectedError) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
          return
        }
        if (e instanceof CategoryDuplicateError) {
          res.writeHead(409, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: '同じ名前のカテゴリが既に存在します' }))
          return
        }
        throw e
      }
      return
    }

    // DELETE /api/categories/:id
    const categoryDeleteMatch = url.match(/^\/api\/categories\/(.+)$/)
    if (categoryDeleteMatch && req.method === 'DELETE') {
      try {
        const deleted = await deleteCategory(categoryDeleteMatch[1], userId)
        if (!deleted) {
          res.writeHead(404, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: 'not found' }))
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ message: 'deleted' }))
      } catch (e: unknown) {
        if (e instanceof CategoryProtectedError) {
          res.writeHead(400, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: e.message }))
          return
        }
        throw e
      }
      return
    }

    // ─── Tasks ────────────────────────────────────────────────────────

    // GET /api/tasks
    if (url === '/api/tasks' && req.method === 'GET') {
      const tasks = await loadTasks({ userId })
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(tasks))
      return
    }

    // POST /api/tasks
    if (url === '/api/tasks' && req.method === 'POST') {
      const body = await readBody(req)
      const task = JSON.parse(body) as Task
      await createTask(task, userId)
      res.writeHead(201, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(task))
      return
    }

    // PATCH /api/tasks/:id
    const patchMatch = url.match(/^\/api\/tasks\/(.+)$/)
    if (patchMatch && req.method === 'PATCH') {
      const body = await readBody(req)
      const updates = JSON.parse(body)
      const updated = await updateTask(patchMatch[1], updates, userId)
      if (!updated) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(updated))
      return
    }

    // DELETE /api/tasks/:id
    const deleteMatch = url.match(/^\/api\/tasks\/(.+)$/)
    if (deleteMatch && req.method === 'DELETE') {
      const deleted = await deleteTask(deleteMatch[1], userId)
      if (!deleted) {
        res.writeHead(404, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ error: 'not found' }))
        return
      }
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify(deleted))
      return
    }

    res.writeHead(404)
    res.end()
  } catch (e) {
    res.writeHead(500, { 'Content-Type': 'application/json' })
    res.end(JSON.stringify({ error: String(e) }))
  }
})

server.listen(3456, () => {
  console.log('API server running at http://localhost:3456')
})
