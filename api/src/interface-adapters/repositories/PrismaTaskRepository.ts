import type {
  TaskRepository,
  TaskListFilter,
  TaskListPage,
} from '../../domain/repositories/TaskRepository.js'
import type { Task, TaskUpdate } from '../../domain/entities/Task.js'
import type { PrismaClient } from '../../framework/prisma/client.js'

// cursor は base64url(id)。デコード失敗時はカーソル無視扱いとして 1 ページ目を返す
function encodeCursor(id: string): string {
  return Buffer.from(id, 'utf-8').toString('base64url')
}
function decodeCursor(cursor: string): string | null {
  try {
    const id = Buffer.from(cursor, 'base64url').toString('utf-8')
    return id.length > 0 ? id : null
  } catch {
    return null
  }
}

const DEFAULT_LIMIT = 100
const MAX_LIMIT = 500

interface DbTaskRow {
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
}

function toEntity(row: DbTaskRow): Task {
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

export class PrismaTaskRepository implements TaskRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async list(filter: TaskListFilter): Promise<TaskListPage> {
    const where: Record<string, unknown> = { userId: filter.userId }
    if (filter.status) where.status = filter.status
    if (filter.category) where.category = filter.category

    const limit = Math.min(Math.max(filter.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT)
    // limit + 1 件取得して hasMore 判定。次ページの cursor は最後の item.id を再利用
    const take = limit + 1

    // ピン済みを最上部 → createdAt 降順 → id 降順 (cursor 安定化のため tie-breaker)
    const orderBy = [
      { pinned: 'desc' as const },
      { createdAt: 'desc' as const },
      { id: 'desc' as const },
    ]

    const cursorId = filter.cursor ? decodeCursor(filter.cursor) : null
    const rows = await this.prisma.task.findMany({
      where,
      orderBy,
      take,
      ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    })

    const hasMore = rows.length > limit
    const pageRows = hasMore ? rows.slice(0, limit) : rows
    const nextCursor =
      hasMore && pageRows.length > 0 ? encodeCursor(pageRows[pageRows.length - 1].id) : null

    return { items: pageRows.map(toEntity), nextCursor }
  }

  async create(task: Task, userId: string): Promise<void> {
    await this.prisma.task.create({
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

  async update(id: string, updates: TaskUpdate, userId: string): Promise<Task | null> {
    const data: Record<string, unknown> = { updatedAt: new Date() }
    if (updates.title !== undefined) data.title = updates.title
    if (updates.status !== undefined) data.status = updates.status
    if (updates.priority !== undefined) data.priority = updates.priority
    if (updates.memo !== undefined) data.memo = updates.memo
    if (updates.category !== undefined) data.category = updates.category.trim()
    if (updates.pinned !== undefined) data.pinned = updates.pinned
    if (updates.dueDate !== undefined) {
      data.dueDate = updates.dueDate ? new Date(updates.dueDate + 'T00:00:00Z') : null
    }

    // updateMany の where に userId を含めることで多層防御 + TOCTOU 排除
    const result = await this.prisma.task.updateMany({ where: { id, userId }, data })
    if (result.count === 0) return null
    const updated = await this.prisma.task.findFirst({ where: { id, userId } })
    return updated ? toEntity(updated) : null
  }

  async delete(id: string, userId: string): Promise<Task | null> {
    // 削除前に entity スナップショットを取得しつつ、deleteMany の where に userId を含めて多層防御
    const existing = await this.prisma.task.findFirst({ where: { id, userId } })
    if (!existing) return null
    const result = await this.prisma.task.deleteMany({ where: { id, userId } })
    if (result.count === 0) return null
    return toEntity(existing)
  }
}
