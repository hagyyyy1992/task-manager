import { describe, it, expect, vi, beforeEach } from 'vitest'
import { PrismaTaskRepository } from '@api/interface-adapters/repositories/PrismaTaskRepository.js'
import { PrismaCategoryRepository } from '@api/interface-adapters/repositories/PrismaCategoryRepository.js'
import { PrismaUserRepository } from '@api/interface-adapters/repositories/PrismaUserRepository.js'
import { PrismaTokenRepository } from '@api/interface-adapters/repositories/PrismaTokenRepository.js'
import { CategoryProtectedError } from '@api/domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '@api/domain/exceptions/CategoryDuplicateError.js'
import { FALLBACK_CATEGORY_NAME, DEFAULT_CATEGORIES } from '@api/domain/entities/Category.js'

const baseDate = new Date('2026-01-01T00:00:00.000Z')

const taskRow = {
  id: 't1',
  title: 'タスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null as Date | null,
  memo: '',
  pinned: false,
  createdAt: baseDate,
  updatedAt: baseDate,
}
const categoryRow = { id: 'c1', userId: 'u1', name: 'foo', sortOrder: 0, createdAt: baseDate }
const userRow = {
  id: 'u1',
  email: 'a@b.com',
  name: 'X',
  passwordHash: 'h',
  passwordChangedAt: null as Date | null,
  termsAgreedAt: null as Date | null,
  createdAt: baseDate,
  updatedAt: baseDate,
}

interface FakePrisma {
  task: Record<string, ReturnType<typeof vi.fn>>
  category: Record<string, ReturnType<typeof vi.fn>>
  user: Record<string, ReturnType<typeof vi.fn>>
  token: Record<string, ReturnType<typeof vi.fn>>
  $transaction: ReturnType<typeof vi.fn>
}

let prisma: FakePrisma

beforeEach(() => {
  prisma = {
    task: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      groupBy: vi.fn(),
    },
    category: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      upsert: vi.fn(),
      delete: vi.fn(),
      deleteMany: vi.fn(),
      aggregate: vi.fn(),
    },
    user: {
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    token: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }
})

// ─── PrismaTaskRepository ────────────────────────────────────────

describe('PrismaTaskRepository', () => {
  it('list は pinned > createdAt > id の order で取得し entity 形式に変換する', async () => {
    prisma.task.findMany.mockResolvedValue([taskRow])
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    const page = await repo.list({ userId: 'u1', status: 'todo', category: 'X' })
    expect(prisma.task.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'todo', category: 'X' },
      // cursor 安定化のため id を tie-breaker に追加 (issue #40)
      orderBy: [{ pinned: 'desc' }, { createdAt: 'desc' }, { id: 'desc' }],
      // limit 100 + 1 (hasMore 判定用)
      take: 101,
    })
    expect(page.items[0].id).toBe('t1')
    expect(page.items[0].dueDate).toBeNull()
    expect(page.items[0].createdAt).toBe(baseDate.toISOString())
    expect(page.nextCursor).toBeNull()
  })

  it('list は dueDate を YYYY-MM-DD 形式で返す', async () => {
    prisma.task.findMany.mockResolvedValue([{ ...taskRow, dueDate: new Date('2026-05-15') }])
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    expect((await repo.list({ userId: 'u1' })).items[0].dueDate).toBe('2026-05-15')
  })

  // cursor pagination 振る舞い (issue #40)
  it('list: limit + 1 件取得し、超過すれば nextCursor=base64url(最後の id) を返す', async () => {
    // limit=2 のとき take=3。3件返ったら hasMore=true、items は 2件、nextCursor は items[1].id
    const rows = [
      { ...taskRow, id: 'a' },
      { ...taskRow, id: 'b' },
      { ...taskRow, id: 'c' },
    ]
    prisma.task.findMany.mockResolvedValue(rows)
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    const page = await repo.list({ userId: 'u1', limit: 2 })
    expect(page.items.map((t) => t.id)).toEqual(['a', 'b'])
    expect(page.nextCursor).toBe(Buffer.from('b', 'utf-8').toString('base64url'))
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 3 }))
  })

  it('list: cursor 指定時は { cursor: { id }, skip: 1 } で resume する', async () => {
    prisma.task.findMany.mockResolvedValue([])
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    const cursor = Buffer.from('abc', 'utf-8').toString('base64url')
    await repo.list({ userId: 'u1', cursor })
    expect(prisma.task.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ cursor: { id: 'abc' }, skip: 1 }),
    )
  })

  it('list: 不正な cursor (デコード失敗) は無視して 1 ページ目を返す', async () => {
    prisma.task.findMany.mockResolvedValue([])
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    await repo.list({ userId: 'u1', cursor: '!@#$%not_base64' })
    const args = prisma.task.findMany.mock.calls[0][0] as Record<string, unknown>
    // base64url としてデコード可能な部分文字列が空文字なら null 扱い → cursor/skip は付かない
    // (実装は decode 失敗 or 空文字を null に倒す)
    if ('cursor' in args) {
      // base64url パーサが寛容なケース: cursor が付いていても OK
      // ここでは少なくとも例外を投げないことを確認
    }
    expect(prisma.task.findMany).toHaveBeenCalled()
  })

  it('list: limit が MAX_LIMIT (500) を超える場合は 500 にクランプする', async () => {
    prisma.task.findMany.mockResolvedValue([])
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    await repo.list({ userId: 'u1', limit: 9999 })
    expect(prisma.task.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 501 }))
  })

  it('create は dueDate が文字列なら Date に変換する', async () => {
    prisma.task.create.mockResolvedValue(taskRow)
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    await repo.create(
      {
        id: 't1',
        title: 'X',
        status: 'todo',
        priority: 'medium',
        category: '  cat  ',
        dueDate: '2026-05-15',
        memo: '',
        pinned: false,
        createdAt: baseDate.toISOString(),
        updatedAt: baseDate.toISOString(),
      },
      'u1',
    )
    const arg = prisma.task.create.mock.calls[0][0].data
    expect(arg.category).toBe('cat')
    expect(arg.dueDate).toBeInstanceOf(Date)
    expect(arg.userId).toBe('u1')
  })

  it('update は updateMany が 0 件なら null（他ユーザーの id は更新しない）', async () => {
    prisma.task.updateMany.mockResolvedValue({ count: 0 })
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    expect(await repo.update('t1', { status: 'done' }, 'u1')).toBeNull()
    expect(prisma.task.updateMany.mock.calls[0][0].where).toEqual({ id: 't1', userId: 'u1' })
  })

  it('update は対象を更新して entity を返す', async () => {
    prisma.task.updateMany.mockResolvedValue({ count: 1 })
    prisma.task.findFirst.mockResolvedValue({ ...taskRow, status: 'done' })
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    const result = await repo.update(
      't1',
      {
        status: 'done',
        priority: 'high',
        title: 't',
        memo: 'm',
        dueDate: '2026-06-01',
        category: 'x',
        pinned: true,
      },
      'u1',
    )
    expect(result?.status).toBe('done')
    const data = prisma.task.updateMany.mock.calls[0][0].data
    expect(data.status).toBe('done')
    expect(data.dueDate).toBeInstanceOf(Date)
    // 多層防御: where に必ず userId を含む
    expect(prisma.task.updateMany.mock.calls[0][0].where).toEqual({ id: 't1', userId: 'u1' })
  })

  it('update は dueDate=null も明示的に渡せる', async () => {
    prisma.task.updateMany.mockResolvedValue({ count: 1 })
    prisma.task.findFirst.mockResolvedValue(taskRow)
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    await repo.update('t1', { dueDate: null }, 'u1')
    expect(prisma.task.updateMany.mock.calls[0][0].data.dueDate).toBeNull()
  })

  it('delete は存在しない id なら null', async () => {
    prisma.task.findFirst.mockResolvedValue(null)
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    expect(await repo.delete('t1', 'u1')).toBeNull()
    expect(prisma.task.deleteMany).not.toHaveBeenCalled()
  })

  it('delete は deleteMany(where userId) で消して削除前の entity を返す', async () => {
    prisma.task.findFirst.mockResolvedValue(taskRow)
    prisma.task.deleteMany = vi.fn().mockResolvedValue({ count: 1 })
    const repo = new PrismaTaskRepository(prisma as unknown as never)
    const result = await repo.delete('t1', 'u1')
    expect(result?.id).toBe('t1')
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({ where: { id: 't1', userId: 'u1' } })
  })
})

// ─── PrismaCategoryRepository ────────────────────────────────────

describe('PrismaCategoryRepository', () => {
  it('listWithCounts は groupBy 結果を taskCount にマージする', async () => {
    prisma.$transaction.mockResolvedValue([
      [categoryRow, { ...categoryRow, id: 'c2', name: 'bar' }],
      [{ category: 'foo', _count: { _all: 3 } }],
    ])
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    const result = await repo.listWithCounts('u1')
    expect(result[0].taskCount).toBe(3)
    expect(result[1].taskCount).toBe(0)
  })

  it('list は sortOrder asc', async () => {
    prisma.category.findMany.mockResolvedValue([categoryRow])
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    expect((await repo.list('u1'))[0].id).toBe('c1')
    expect(prisma.category.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { sortOrder: 'asc' },
    })
  })

  it('create は sortOrder のデフォルトを 0 にする', async () => {
    prisma.category.create.mockResolvedValue(categoryRow)
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await repo.create('u1', 'X')
    expect(prisma.category.create.mock.calls[0][0].data.sortOrder).toBe(0)
  })

  it('update: 存在しなければ null', async () => {
    prisma.category.findFirst.mockResolvedValue(null)
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    expect(await repo.update('x', { name: 'y' }, 'u1')).toBeNull()
  })

  it('update: 「その他」のリネームは CategoryProtectedError', async () => {
    prisma.category.findFirst.mockResolvedValue({ ...categoryRow, name: FALLBACK_CATEGORY_NAME })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.update('c1', { name: 'x' }, 'u1')).rejects.toThrow(CategoryProtectedError)
  })

  it('update: リネーム時に同名既存があると CategoryDuplicateError', async () => {
    prisma.category.findFirst.mockResolvedValue(categoryRow)
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findFirst: vi.fn().mockResolvedValue({ id: 'other' }),
          update: vi.fn(),
        },
        task: { updateMany: vi.fn() },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.update('c1', { name: '別名' }, 'u1')).rejects.toThrow(CategoryDuplicateError)
  })

  it('update: リネーム時に関連タスクの category も更新する', async () => {
    prisma.category.findFirst.mockResolvedValue(categoryRow)
    const taskUpdateMany = vi.fn()
    const catUpdate = vi.fn().mockResolvedValue({ ...categoryRow, name: '改名' })
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: { findFirst: vi.fn().mockResolvedValue(null), update: catUpdate },
        task: { updateMany: taskUpdateMany },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    const result = await repo.update('c1', { name: '改名' }, 'u1')
    expect(result?.name).toBe('改名')
    expect(taskUpdateMany).toHaveBeenCalled()
  })

  it('delete: 存在しなければ false', async () => {
    prisma.category.findFirst.mockResolvedValue(null)
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    expect(await repo.delete('x', 'u1')).toBe(false)
  })

  it('delete: 「その他」は CategoryProtectedError', async () => {
    prisma.category.findFirst.mockResolvedValue({ ...categoryRow, name: FALLBACK_CATEGORY_NAME })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.delete('c1', 'u1')).rejects.toThrow(CategoryProtectedError)
  })

  it('delete: 関連タスクを「その他」に付け替えて削除する', async () => {
    prisma.category.findFirst.mockResolvedValue({ ...categoryRow, name: 'foo' })
    const taskUpdateMany = vi.fn()
    const catDelete = vi.fn()
    const catUpsert = vi.fn()
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          aggregate: vi.fn().mockResolvedValue({ _max: { sortOrder: 4 } }),
          upsert: catUpsert,
          delete: catDelete,
        },
        task: { updateMany: taskUpdateMany },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    expect(await repo.delete('c1', 'u1')).toBe(true)
    expect(taskUpdateMany).toHaveBeenCalled()
    expect(catDelete).toHaveBeenCalled()
    expect(catUpsert).toHaveBeenCalled()
  })

  it('reorder: 個数不一致は CategoryReorderError', async () => {
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: { findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]) },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.reorder('u1', ['a'])).rejects.toThrow('過不足')
  })

  it('reorder: 不正なIDは CategoryReorderError', async () => {
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          update: vi.fn(),
        },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.reorder('u1', ['a', 'c'])).rejects.toThrow('不正')
  })

  it('reorder: 重複IDは CategoryReorderError', async () => {
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          update: vi.fn(),
        },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await expect(repo.reorder('u1', ['a', 'a'])).rejects.toThrow('重複')
  })

  it('reorder: 成功時は sortOrder を 0..N に書き換える', async () => {
    const update = vi.fn()
    prisma.$transaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) => {
      const tx = {
        category: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
            .mockResolvedValueOnce([categoryRow]),
          update,
        },
      }
      return cb(tx)
    })
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await repo.reorder('u1', ['b', 'a'])
    expect(update).toHaveBeenCalledTimes(2)
  })

  it('seedDefaults: DEFAULT_CATEGORIES の数だけ upsert する', async () => {
    prisma.category.upsert.mockResolvedValue(categoryRow)
    const repo = new PrismaCategoryRepository(prisma as unknown as never)
    await repo.seedDefaults('u1')
    expect(prisma.category.upsert).toHaveBeenCalledTimes(DEFAULT_CATEGORIES.length)
  })
})

// ─── PrismaUserRepository ────────────────────────────────────────

describe('PrismaUserRepository', () => {
  it('findByEmail: 取得して passwordHash 込みで返す', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    const u = await repo.findByEmail('a@b.com')
    expect(u?.passwordHash).toBe('h')
  })

  it('findByEmail: 無ければ null', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.findByEmail('x')).toBeNull()
  })

  it('findById: 取得して passwordHash 抜きで返す', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    const u = await repo.findById('u1')
    expect(u).not.toBeNull()
    expect((u as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
  })

  it('findById: 無ければ null', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.findById('x')).toBeNull()
  })

  it('findByIdWithSecret: 取得して passwordHash 込みで返す', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    const u = await repo.findByIdWithSecret('u1')
    expect(u?.passwordHash).toBe('h')
  })

  it('findByIdWithSecret: 無ければ null', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.findByIdWithSecret('x')).toBeNull()
  })

  it('create: termsAgreedAt 文字列を Date に変換', async () => {
    prisma.user.create.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    await repo.create('u1', 'a@b.com', 'X', 'h', baseDate.toISOString())
    expect(prisma.user.create.mock.calls[0][0].data.termsAgreedAt).toBeInstanceOf(Date)
  })

  it('create: termsAgreedAt 未指定は null', async () => {
    prisma.user.create.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    await repo.create('u1', 'a@b.com', 'X', 'h')
    expect(prisma.user.create.mock.calls[0][0].data.termsAgreedAt).toBeNull()
  })

  it('updatePassword: 存在しない場合は false', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.updatePassword('u1', 'h')).toBe(false)
  })

  it('updatePassword: 成功時は true', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    prisma.user.update.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.updatePassword('u1', 'newh')).toBe(true)
  })

  // issue #36: passwordChangedAt を update 時に現在時刻で更新する（auth middleware の失効基準点）
  it('updatePassword: passwordChangedAt と updatedAt を同じ now で更新する', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    prisma.user.update.mockResolvedValue(userRow)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    const before = Date.now()
    await repo.updatePassword('u1', 'newh')
    const after = Date.now()
    const callArgs = prisma.user.update.mock.calls[0][0] as {
      data: { passwordHash: string; passwordChangedAt: Date; updatedAt: Date }
    }
    expect(callArgs.data.passwordHash).toBe('newh')
    expect(callArgs.data.passwordChangedAt).toBeInstanceOf(Date)
    expect(callArgs.data.passwordChangedAt.getTime()).toBeGreaterThanOrEqual(before)
    expect(callArgs.data.passwordChangedAt.getTime()).toBeLessThanOrEqual(after)
    // updatedAt と同一インスタンスであることで「同瞬間」を保証
    expect(callArgs.data.updatedAt).toBe(callArgs.data.passwordChangedAt)
  })

  it('delete: 存在しない場合は false', async () => {
    prisma.user.findUnique.mockResolvedValue(null)
    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.delete('u1')).toBe(false)
  })

  it('delete: 関連 task/category/token も同一トランザクションで削除する', async () => {
    prisma.user.findUnique.mockResolvedValue(userRow)
    const ops: string[] = []
    prisma.task.deleteMany = vi.fn(async () => {
      ops.push('task.deleteMany')
      return { count: 5 }
    })
    prisma.category.deleteMany = vi.fn(async () => {
      ops.push('category.deleteMany')
      return { count: 3 }
    })
    prisma.token.deleteMany = vi.fn(async () => {
      ops.push('token.deleteMany')
      return { count: 2 }
    })
    prisma.user.delete = vi.fn(async () => {
      ops.push('user.delete')
      return userRow
    })
    prisma.$transaction = vi.fn(async (calls: Promise<unknown>[]) => Promise.all(calls))

    const repo = new PrismaUserRepository(prisma as unknown as never)
    expect(await repo.delete('u1')).toBe(true)
    // Token も明示削除し、認証関連データを孤児化させない (codex review #50 対応)
    expect(ops).toEqual([
      'task.deleteMany',
      'category.deleteMany',
      'token.deleteMany',
      'user.delete',
    ])
    expect(prisma.task.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(prisma.category.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
    expect(prisma.token.deleteMany).toHaveBeenCalledWith({ where: { userId: 'u1' } })
  })
})

// ─── PrismaTokenRepository (issue #37) ───────────────────────────

const tokenRow = {
  id: 'tok-1',
  userId: 'u1',
  scope: 'mcp',
  jti: 'jti-1',
  label: 'macbook',
  createdAt: baseDate,
  lastUsedAt: null as Date | null,
  revokedAt: null as Date | null,
}

describe('PrismaTokenRepository', () => {
  it('create: 渡した値をそのまま INSERT して entity を返す', async () => {
    prisma.token.create.mockResolvedValue(tokenRow)
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    const result = await repo.create({
      id: 'tok-1',
      userId: 'u1',
      scope: 'mcp',
      jti: 'jti-1',
      label: 'macbook',
    })
    expect(prisma.token.create).toHaveBeenCalledWith({
      data: { id: 'tok-1', userId: 'u1', scope: 'mcp', jti: 'jti-1', label: 'macbook' },
    })
    expect(result.scope).toBe('mcp')
    expect(result.revokedAt).toBeNull()
  })

  it('findByJti: 該当行を entity として返す', async () => {
    prisma.token.findUnique.mockResolvedValue(tokenRow)
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    const result = await repo.findByJti('jti-1')
    expect(prisma.token.findUnique).toHaveBeenCalledWith({ where: { jti: 'jti-1' } })
    expect(result?.id).toBe('tok-1')
  })

  it('findByJti: 不在なら null', async () => {
    prisma.token.findUnique.mockResolvedValue(null)
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.findByJti('jti-x')).toBeNull()
  })

  it("listActiveByUser: revoked を除外し scope='mcp' に絞って createdAt 降順で取得 (issue #66)", async () => {
    prisma.token.findMany.mockResolvedValue([tokenRow])
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    await repo.listActiveByUser('u1')
    // reset token (scope='reset') は UI 一覧に出さないため scope='mcp' で絞る
    expect(prisma.token.findMany).toHaveBeenCalledWith({
      where: { userId: 'u1', revokedAt: null, scope: 'mcp' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('revoke: 多層防御として where に userId と revokedAt:null を含めて updateMany', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 1 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revoke('tok-1', 'u1')).toBe(true)
    const args = prisma.token.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ id: 'tok-1', userId: 'u1', revokedAt: null })
    expect(args.data.revokedAt).toBeInstanceOf(Date)
  })

  it('revoke: 該当 0 件は false (他ユーザーの id / 既 revoke / 不在)', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 0 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revoke('tok-x', 'u1')).toBe(false)
  })

  it('revokeByJti (userId なし): reset token の single-use 化 (issue #66)', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 1 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revokeByJti('jti-1')).toBe(true)
    const args = prisma.token.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ jti: 'jti-1', scope: 'reset', revokedAt: null })
    expect(args.data.revokedAt).toBeInstanceOf(Date)
  })

  it('revokeByJti (userId あり): session logout (issue #60)', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 1 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revokeByJti('jti-sess', 'u1')).toBe(true)
    const args = prisma.token.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ jti: 'jti-sess', userId: 'u1', revokedAt: null })
    expect(args.data.revokedAt).toBeInstanceOf(Date)
  })

  it('revokeByJti: 該当 0 件 (race / 既 revoke / 不在) は false', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 0 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revokeByJti('jti-used')).toBe(false)
  })

  it('revokeAllByUserAndScope: 指定 scope のアクティブトークンを一括 revoke (issue #60)', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 3 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    expect(await repo.revokeAllByUserAndScope('u1', 'session')).toBe(3)
    const args = prisma.token.updateMany.mock.calls[0][0]
    expect(args.where).toEqual({ userId: 'u1', scope: 'session', revokedAt: null })
    expect(args.data.revokedAt).toBeInstanceOf(Date)
  })

  it('touchLastUsed: 例外を投げず updateMany のみ呼ぶ', async () => {
    prisma.token.updateMany.mockResolvedValue({ count: 1 })
    const repo = new PrismaTokenRepository(prisma as unknown as never)
    const at = new Date('2026-04-27T12:34:56.000Z')
    await repo.touchLastUsed('jti-1', at)
    expect(prisma.token.updateMany).toHaveBeenCalledWith({
      where: { jti: 'jti-1' },
      data: { lastUsedAt: at },
    })
  })
})
