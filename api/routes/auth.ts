import { Hono } from 'hono'
import { randomUUID } from 'crypto'
import {
  findUserByEmail,
  findUserById,
  createUser,
  updateUserPassword,
  deleteUser,
  seedDefaultCategories,
} from '../lib/db.js'
import { hashPassword, verifyPassword, createToken } from '../lib/auth.js'
import type { AppEnv } from '../index.js'

export const authRoutes = new Hono<AppEnv>()

// POST /register
authRoutes.post('/register', async (c) => {
  if (process.env.ALLOW_REGISTRATION !== 'true') {
    return c.json({ error: '新規登録は現在受け付けていません' }, 403)
  }

  const { email, password, name, termsAgreed } = await c.req.json<{
    email?: string
    password?: string
    name?: string
    termsAgreed?: boolean
  }>()

  if (!email || !password || !name) {
    return c.json({ error: 'email, password, name are required' }, 400)
  }
  if (password.length < 8) {
    return c.json({ error: 'password must be at least 8 characters' }, 400)
  }
  if (!termsAgreed) {
    return c.json({ error: '利用規約への同意が必要です' }, 400)
  }

  const existing = await findUserByEmail(email)
  if (existing) {
    return c.json({ error: 'email already registered' }, 409)
  }

  const id = randomUUID()
  const passwordHash = await hashPassword(password)
  const termsAgreedAt = new Date().toISOString()
  const user = await createUser(id, email, name, passwordHash, termsAgreedAt)
  await seedDefaultCategories(user.id)
  const token = await createToken(user.id)

  return c.json({ user, token }, 201)
})

// POST /login
authRoutes.post('/login', async (c) => {
  const { email, password } = await c.req.json<{ email?: string; password?: string }>()

  if (!email || !password) {
    return c.json({ error: 'email and password are required' }, 400)
  }

  const userRow = await findUserByEmail(email)
  if (!userRow) {
    return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
  }

  const valid = await verifyPassword(password, userRow.password_hash)
  if (!valid) {
    return c.json({ error: 'メールアドレスまたはパスワードが正しくありません' }, 401)
  }

  const token = await createToken(userRow.id)
  const user = {
    id: userRow.id,
    email: userRow.email,
    name: userRow.name,
    createdAt: userRow.created_at,
    updatedAt: userRow.updated_at,
  }

  return c.json({ user, token }, 200)
})

// GET /me  (protected)
authRoutes.get('/me', async (c) => {
  const userId = c.get('userId')
  const user = await findUserById(userId)
  if (!user) return c.json({ error: 'user not found' }, 404)
  return c.json(user, 200)
})

// PATCH /password  (protected)
authRoutes.patch('/password', async (c) => {
  const userId = c.get('userId')
  const { currentPassword, newPassword } = await c.req.json<{
    currentPassword?: string
    newPassword?: string
  }>()

  if (!currentPassword || !newPassword) {
    return c.json({ error: 'currentPassword and newPassword are required' }, 400)
  }
  if (newPassword.length < 8) {
    return c.json({ error: 'new password must be at least 8 characters' }, 400)
  }

  const me = await findUserById(userId)
  if (!me) return c.json({ error: 'unauthorized' }, 401)

  const userRow = await findUserByEmail(me.email)
  if (!userRow) return c.json({ error: 'user not found' }, 404)

  const valid = await verifyPassword(currentPassword, userRow.password_hash)
  if (!valid) return c.json({ error: 'current password is incorrect' }, 401)

  const newHash = await hashPassword(newPassword)
  await updateUserPassword(userId, newHash)

  return c.json({ message: 'password updated' }, 200)
})

// DELETE /account  (protected)
authRoutes.delete('/account', async (c) => {
  const userId = c.get('userId')
  const deleted = await deleteUser(userId)
  if (!deleted) return c.json({ error: 'user not found' }, 404)
  return c.json({ message: 'account deleted' }, 200)
})
