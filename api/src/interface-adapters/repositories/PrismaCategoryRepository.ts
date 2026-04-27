import type { CategoryRepository } from '../../domain/repositories/CategoryRepository.js'
import type { Category, CategoryWithCount } from '../../domain/entities/Category.js'
import { DEFAULT_CATEGORIES, FALLBACK_CATEGORY_NAME } from '../../domain/entities/Category.js'
import { CategoryProtectedError } from '../../domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '../../domain/exceptions/CategoryDuplicateError.js'
import { CategoryReorderError } from '../../domain/exceptions/CategoryReorderError.js'
import type { PrismaClient } from '../../framework/prisma/client.js'

interface DbCategoryRow {
  id: string
  userId: string
  name: string
  sortOrder: number
  createdAt: Date
}

function toEntity(row: DbCategoryRow): Category {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    sortOrder: row.sortOrder,
    createdAt: row.createdAt.toISOString(),
  }
}

export class PrismaCategoryRepository implements CategoryRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async listWithCounts(userId: string): Promise<CategoryWithCount[]> {
    // 同一トランザクションで読むことで rename/delete が割り込んだ状態を観測しないようにする
    const [rows, counts] = await this.prisma.$transaction([
      this.prisma.category.findMany({ where: { userId }, orderBy: { sortOrder: 'asc' } }),
      this.prisma.task.groupBy({
        by: ['category'],
        where: { userId },
        _count: { _all: true },
      }),
    ])
    const countMap = new Map(counts.map((c) => [c.category, c._count._all]))
    return rows.map((row) => ({ ...toEntity(row), taskCount: countMap.get(row.name) ?? 0 }))
  }

  async list(userId: string): Promise<Category[]> {
    const rows = await this.prisma.category.findMany({
      where: { userId },
      orderBy: { sortOrder: 'asc' },
    })
    return rows.map(toEntity)
  }

  async create(userId: string, name: string, sortOrder?: number): Promise<Category> {
    const row = await this.prisma.category.create({
      data: { userId, name, sortOrder: sortOrder ?? 0 },
    })
    return toEntity(row)
  }

  async update(
    id: string,
    updates: { name?: string; sortOrder?: number },
    userId: string,
  ): Promise<Category | null> {
    const existing = await this.prisma.category.findFirst({ where: { id, userId } })
    if (!existing) return null

    const oldName = existing.name
    const newName = updates.name
    const renaming = newName !== undefined && newName !== oldName

    if (renaming && oldName === FALLBACK_CATEGORY_NAME) {
      throw new CategoryProtectedError(
        `「${FALLBACK_CATEGORY_NAME}」カテゴリの名前は変更できません`,
      )
    }

    const data: Record<string, unknown> = {}
    if (updates.name !== undefined) data.name = updates.name
    if (updates.sortOrder !== undefined) data.sortOrder = updates.sortOrder

    const updated = await this.prisma.$transaction(async (tx) => {
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

    return toEntity(updated)
  }

  async delete(id: string, userId: string): Promise<boolean> {
    const existing = await this.prisma.category.findFirst({ where: { id, userId } })
    if (!existing) return false

    if (existing.name === FALLBACK_CATEGORY_NAME) {
      throw new CategoryProtectedError()
    }

    await this.prisma.$transaction(async (tx) => {
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

  async reorder(userId: string, orderedIds: string[]): Promise<Category[]> {
    // 検証と更新を同一トランザクションに閉じ込めて、別リクエストでの追加・削除と競合しない古い集合を上書きしないようにする
    const rows = await this.prisma.$transaction(async (tx) => {
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
    return rows.map(toEntity)
  }

  async seedDefaults(userId: string): Promise<void> {
    for (const cat of DEFAULT_CATEGORIES) {
      await this.prisma.category.upsert({
        where: { userId_name: { userId, name: cat.name } },
        create: { userId, name: cat.name, sortOrder: cat.sortOrder },
        update: {},
      })
    }
  }
}
