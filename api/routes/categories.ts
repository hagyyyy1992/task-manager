import { Hono } from 'hono'
import {
  loadCategoriesWithCounts,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  CategoryProtectedError,
  CategoryDuplicateError,
  CategoryReorderError,
} from '../lib/db.js'
import type { AppEnv } from '../index.js'

export const categoryRoutes = new Hono<AppEnv>()

function isValidSortOrder(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
}

function isPrismaUniqueViolationOnName(e: unknown): boolean {
  if (!e || typeof e !== 'object') return false
  const err = e as { code?: unknown; meta?: { target?: unknown } }
  if (err.code !== 'P2002') return false
  const target = err.meta?.target
  if (Array.isArray(target)) return target.includes('name')
  if (typeof target === 'string') return target.includes('name')
  // target が無い場合は安全側で true（Category 唯一の unique 制約は (userId, name)）
  return target === undefined
}

// GET /
categoryRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const categories = await loadCategoriesWithCounts(userId)
  return c.json(categories, 200)
})

// PATCH /reorder  (define before /:id)
categoryRoutes.patch('/reorder', async (c) => {
  const userId = c.get('userId')
  const body = await c.req.json<{ ids?: unknown }>()
  if (!Array.isArray(body.ids) || !body.ids.every((x) => typeof x === 'string')) {
    return c.json({ error: 'ids must be string[]' }, 400)
  }
  try {
    const updated = await reorderCategories(userId, body.ids as string[])
    return c.json(updated, 200)
  } catch (e: unknown) {
    if (e instanceof CategoryReorderError) {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }
})

// POST /
categoryRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const { name, sortOrder } = await c.req.json<{ name?: string; sortOrder?: number }>()
  if (!name || !name.trim()) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (sortOrder !== undefined && !isValidSortOrder(sortOrder)) {
    return c.json({ error: 'invalid sortOrder' }, 400)
  }
  const category = await createCategory(userId, name.trim(), sortOrder)
  return c.json(category, 201)
})

// PATCH /:id
categoryRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const updates = await c.req.json<{ name?: string; sortOrder?: number }>()
  const trimmedName = updates.name?.trim()
  if (updates.name !== undefined && !trimmedName) {
    return c.json({ error: 'name is required' }, 400)
  }
  if (updates.sortOrder !== undefined && !isValidSortOrder(updates.sortOrder)) {
    return c.json({ error: 'invalid sortOrder' }, 400)
  }
  try {
    const updated = await updateCategory(id, { ...updates, name: trimmedName }, userId)
    if (!updated) return c.json({ error: 'not found' }, 404)
    return c.json(updated, 200)
  } catch (e: unknown) {
    if (e instanceof CategoryProtectedError) {
      return c.json({ error: e.message }, 400)
    }
    if (e instanceof CategoryDuplicateError || isPrismaUniqueViolationOnName(e)) {
      return c.json({ error: '同じ名前のカテゴリが既に存在します' }, 409)
    }
    throw e
  }
})

// DELETE /:id
categoryRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  try {
    const deleted = await deleteCategory(id, userId)
    if (!deleted) return c.json({ error: 'not found' }, 404)
    return c.json({ message: 'deleted' }, 200)
  } catch (e: unknown) {
    if (e instanceof CategoryProtectedError) {
      return c.json({ error: e.message }, 400)
    }
    throw e
  }
})
