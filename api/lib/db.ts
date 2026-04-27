import { PrismaClient } from '../../src/generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
// repo root (api/lib/db.ts → ../../.env)
const envFile = join(__dirname, '..', '..', '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const adapter = new PrismaNeon({
  connectionString: process.env.DATABASE_URL!,
})
export const prisma = new PrismaClient({ adapter })

export interface Task {
  id: string
  title: string
  status: 'todo' | 'in_progress' | 'done'
  priority: 'high' | 'medium' | 'low'
  category: string
  dueDate: string | null
  memo: string
  pinned: boolean
  createdAt: string
  updatedAt: string
}

function dbTaskToTask(row: {
  id: string
  title: string
  status: string
  priority: string
  category: string
  dueDate: Date | null
  memo: string
  pinned: boolean
  createdAt: Date
  updatedAt: Date
}): Task {
  return {
    id: row.id,
    title: row.title,
    status: row.status as Task['status'],
    priority: row.priority as Task['priority'],
    category: row.category,
    dueDate: row.dueDate ? row.dueDate.toISOString().slice(0, 10) : null,
    memo: row.memo,
    pinned: row.pinned,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  }
}

export async function loadTasks(filters?: {
  status?: string
  category?: string
  userId?: string
}): Promise<Task[]> {
  const where: Record<string, unknown> = {}
  if (filters?.userId) where.userId = filters.userId
  if (filters?.status) where.status = filters.status
  if (filters?.category) where.category = filters.category

  const rows = await prisma.task.findMany({
    where,
    // ピン済みを常に最上部に。同区分内は createdAt 降順。
    orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
  })

  return rows.map(dbTaskToTask)
}

export async function createTask(task: Task, userId: string): Promise<void> {
  await prisma.task.create({
    data: {
      id: task.id,
      title: task.title,
      status: task.status,
      priority: task.priority,
      category: task.category.trim(),
      dueDate: task.dueDate ? new Date(task.dueDate + 'T00:00:00Z') : null,
      memo: task.memo,
      pinned: task.pinned,
      userId,
      createdAt: new Date(task.createdAt),
      updatedAt: new Date(task.updatedAt),
    },
  })
}

export async function updateTask(
  id: string,
  updates: Partial<
    Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate' | 'category' | 'pinned'>
  >,
  userId: string,
): Promise<Task | null> {
  const existing = await prisma.task.findFirst({ where: { id, userId } })
  if (!existing) return null

  const now = new Date()
  const data: Record<string, unknown> = { updatedAt: now }
  if (updates.title !== undefined) data.title = updates.title
  if (updates.status !== undefined) data.status = updates.status
  if (updates.priority !== undefined) data.priority = updates.priority
  if (updates.memo !== undefined) data.memo = updates.memo
  if (updates.category !== undefined) data.category = updates.category.trim()
  if (updates.pinned !== undefined) data.pinned = updates.pinned
  if (updates.dueDate !== undefined) {
    data.dueDate = updates.dueDate ? new Date(updates.dueDate + 'T00:00:00Z') : null
  }

  const updated = await prisma.task.update({ where: { id }, data })
  return dbTaskToTask(updated)
}

export async function deleteTask(id: string, userId: string): Promise<Task | null> {
  const existing = await prisma.task.findFirst({ where: { id, userId } })
  if (!existing) return null

  await prisma.task.delete({ where: { id } })
  return dbTaskToTask(existing)
}

// ─── Users ──────────────────────────────────────────────────────────────────

export interface User {
  id: string
  email: string
  name: string
  createdAt: string
  updatedAt: string
}

interface UserDbRow {
  id: string
  email: string
  name: string
  password_hash: string
  created_at: string
  updated_at: string
}

export async function findUserByEmail(email: string): Promise<UserDbRow | null> {
  const user = await prisma.user.findUnique({ where: { email } })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    password_hash: user.passwordHash,
    created_at: user.createdAt.toISOString(),
    updated_at: user.updatedAt.toISOString(),
  }
}

export async function findUserById(id: string): Promise<User | null> {
  const user = await prisma.user.findUnique({ where: { id } })
  if (!user) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function createUser(
  id: string,
  email: string,
  name: string,
  passwordHash: string,
  termsAgreedAt?: string,
): Promise<User> {
  const now = new Date()
  const user = await prisma.user.create({
    data: {
      id,
      email,
      name,
      passwordHash,
      termsAgreedAt: termsAgreedAt ? new Date(termsAgreedAt) : null,
      createdAt: now,
      updatedAt: now,
    },
  })
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    createdAt: user.createdAt.toISOString(),
    updatedAt: user.updatedAt.toISOString(),
  }
}

export async function updateUserPassword(id: string, passwordHash: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) return false
  const now = new Date()
  await prisma.user.update({
    where: { id },
    data: { passwordHash, updatedAt: now },
  })
  return true
}

export async function deleteUser(id: string): Promise<boolean> {
  const existing = await prisma.user.findUnique({ where: { id } })
  if (!existing) return false
  // Cascade will delete tasks and categories automatically
  await prisma.user.delete({ where: { id } })
  return true
}

// ─── Categories ─────────────────────────────────────────────────────────────

export interface Category {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: string
}

function dbCategoryToCategory(row: {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: Date
}): Category {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }
}

export const DEFAULT_CATEGORIES: ReadonlyArray<{ name: string; sortOrder: number }> = [
  { name: '決算・税務', sortOrder: 0 },
  { name: '案件・営業', sortOrder: 1 },
  { name: 'プロダクト開発', sortOrder: 2 },
  { name: '事務・手続き', sortOrder: 3 },
  { name: 'その他', sortOrder: 4 },
]

export async function seedDefaultCategories(userId: string): Promise<void> {
  for (const cat of DEFAULT_CATEGORIES) {
    await prisma.category.upsert({
      where: { userId_name: { userId, name: cat.name } },
      create: { userId, name: cat.name, sortOrder: cat.sortOrder },
      update: {},
    })
  }
}

export async function loadCategories(userId: string): Promise<Category[]> {
  const rows = await prisma.category.findMany({
    where: { userId },
    orderBy: { sortOrder: 'asc' },
  })
  return rows.map(dbCategoryToCategory)
}

export interface CategoryWithCount extends Category {
  taskCount: number
}

export async function loadCategoriesWithCounts(userId: string): Promise<CategoryWithCount[]> {
  // 同一トランザクション内で読むことで、間に rename/delete が割り込んで
  // categories.name と tasks.category の対応が崩れた状態を観測しないようにする
  const [rows, counts] = await prisma.$transaction([
    prisma.category.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    }),
    prisma.task.groupBy({
      by: ['category'],
      where: { userId },
      _count: { _all: true },
    }),
  ])
  const countMap = new Map(counts.map((c) => [c.category, c._count._all]))
  return rows.map((row) => ({
    ...dbCategoryToCategory(row),
    taskCount: countMap.get(row.name) ?? 0,
  }))
}

export async function createCategory(
  userId: string,
  name: string,
  sortOrder?: number,
): Promise<Category> {
  const order = sortOrder ?? 0
  const row = await prisma.category.create({
    data: { userId, name, sortOrder: order },
  })
  return dbCategoryToCategory(row)
}

export const FALLBACK_CATEGORY_NAME = 'その他'

export class CategoryProtectedError extends Error {
  constructor(message = `「${FALLBACK_CATEGORY_NAME}」カテゴリは削除できません`) {
    super(message)
    this.name = 'CategoryProtectedError'
  }
}

export class CategoryDuplicateError extends Error {
  constructor(message = '同じ名前のカテゴリが既に存在します') {
    super(message)
    this.name = 'CategoryDuplicateError'
  }
}

export class CategoryReorderError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CategoryReorderError'
  }
}

export async function reorderCategories(userId: string, orderedIds: string[]): Promise<Category[]> {
  // 検証と更新を同一トランザクション内に閉じ込めることで、
  // 別リクエストのカテゴリ追加・削除と競合した古い集合で sortOrder を上書きしないようにする
  return prisma
    .$transaction(async (tx) => {
      const existing = await tx.category.findMany({ where: { userId } })
      if (orderedIds.length !== existing.length) {
        throw new CategoryReorderError('全カテゴリのIDを過不足なく指定してください')
      }
      const ownedIds = new Set(existing.map((c) => c.id))
      const seen = new Set<string>()
      for (const id of orderedIds) {
        if (!ownedIds.has(id)) throw new CategoryReorderError('不正なカテゴリIDが含まれています')
        if (seen.has(id)) throw new CategoryReorderError('重複したカテゴリIDが含まれています')
        seen.add(id)
      }
      for (let i = 0; i < orderedIds.length; i++) {
        await tx.category.update({ where: { id: orderedIds[i] }, data: { sortOrder: i } })
      }
      return tx.category.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } })
    })
    .then((rows) => rows.map(dbCategoryToCategory))
}

export async function updateCategory(
  id: string,
  updates: { name?: string; sortOrder?: number },
  userId: string,
): Promise<Category | null> {
  const existing = await prisma.category.findFirst({ where: { id, userId } })
  if (!existing) return null

  const oldName = existing.name
  const newName = updates.name
  const renaming = newName !== undefined && newName !== oldName

  if (renaming && oldName === FALLBACK_CATEGORY_NAME) {
    throw new CategoryProtectedError(`「${FALLBACK_CATEGORY_NAME}」カテゴリの名前は変更できません`)
  }

  const data: Record<string, unknown> = {}
  if (updates.name !== undefined) data.name = updates.name
  if (updates.sortOrder !== undefined) data.sortOrder = updates.sortOrder

  const updated = await prisma.$transaction(async (tx) => {
    if (renaming) {
      const dup = await tx.category.findFirst({
        where: { userId, name: newName, NOT: { id } },
      })
      if (dup) throw new CategoryDuplicateError()
      await tx.task.updateMany({
        where: { userId, category: oldName },
        data: { category: newName },
      })
    }
    return tx.category.update({ where: { id }, data })
  })

  return dbCategoryToCategory(updated)
}

export async function deleteCategory(id: string, userId: string): Promise<boolean> {
  const existing = await prisma.category.findFirst({ where: { id, userId } })
  if (!existing) return false

  if (existing.name === FALLBACK_CATEGORY_NAME) {
    throw new CategoryProtectedError()
  }

  await prisma.$transaction(async (tx) => {
    const max = await tx.category.aggregate({
      where: { userId },
      _max: { sortOrder: true },
    })
    const nextOrder = (max._max.sortOrder ?? -1) + 1
    await tx.category.upsert({
      where: { userId_name: { userId, name: FALLBACK_CATEGORY_NAME } },
      create: { userId, name: FALLBACK_CATEGORY_NAME, sortOrder: nextOrder },
      update: {},
    })
    await tx.task.updateMany({
      where: { userId, category: existing.name },
      data: { category: FALLBACK_CATEGORY_NAME },
    })
    await tx.category.delete({ where: { id } })
  })
  return true
}
