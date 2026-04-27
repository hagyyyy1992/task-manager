import type { TaskRepository, TaskListFilter } from '../../domain/repositories/TaskRepository.js'
import type { Task, TaskUpdate } from '../../domain/entities/Task.js'
import type { PrismaClient } from '../../framework/prisma/client.js'

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

  async list(filter: TaskListFilter): Promise<Task[]> {
    const where: Record<string, unknown> = { userId: filter.userId }
    if (filter.status) where.status = filter.status
    if (filter.category) where.category = filter.category

    const rows = await this.prisma.task.findMany({
      where,
      // ピン済みを常に最上部に。同区分内は createdAt 降順。
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }],
    })
    return rows.map(toEntity)
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
    const existing = await this.prisma.task.findFirst({ where: { id, userId } })
    if (!existing) return null

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

    const updated = await this.prisma.task.update({ where: { id }, data })
    return toEntity(updated)
  }

  async delete(id: string, userId: string): Promise<Task | null> {
    const existing = await this.prisma.task.findFirst({ where: { id, userId } })
    if (!existing) return null
    await this.prisma.task.delete({ where: { id } })
    return toEntity(existing)
  }
}
