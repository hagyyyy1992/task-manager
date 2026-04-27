import { describe, it, expect, vi, beforeEach } from 'vitest'

// PrismaClient のメソッドを vi.fn でスタブ化
const taskFindMany = vi.fn()
const taskFindFirst = vi.fn()
const taskCreate = vi.fn()
const taskUpdate = vi.fn()
const taskDelete = vi.fn()
const taskGroupBy = vi.fn()
const taskUpdateMany = vi.fn()

const userFindUnique = vi.fn()
const userCreate = vi.fn()
const userUpdate = vi.fn()
const userDelete = vi.fn()

const categoryFindMany = vi.fn()
const categoryFindFirst = vi.fn()
const categoryCreate = vi.fn()
const categoryUpdate = vi.fn()
const categoryDelete = vi.fn()
const categoryUpsert = vi.fn()
const categoryAggregate = vi.fn()

const dollarTransaction = vi.fn()

class FakePrismaClient {
  task = {
    findMany: taskFindMany,
    findFirst: taskFindFirst,
    create: taskCreate,
    update: taskUpdate,
    delete: taskDelete,
    groupBy: taskGroupBy,
    updateMany: taskUpdateMany,
  }
  user = {
    findUnique: userFindUnique,
    create: userCreate,
    update: userUpdate,
    delete: userDelete,
  }
  category = {
    findMany: categoryFindMany,
    findFirst: categoryFindFirst,
    create: categoryCreate,
    update: categoryUpdate,
    delete: categoryDelete,
    upsert: categoryUpsert,
    aggregate: categoryAggregate,
  }
  $transaction = dollarTransaction
}

vi.mock('./src/generated/prisma/client.js', () => ({
  PrismaClient: FakePrismaClient,
}))

vi.mock('@prisma/adapter-neon', () => ({
  PrismaNeon: class {
    constructor() {}
  },
}))

// db.ts は import 時に DATABASE_URL を参照するので環境変数を先に設定する
process.env.DATABASE_URL = 'postgres://test'

const {
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
  loadCategoriesWithCounts,
  createCategory,
  updateCategory,
  deleteCategory,
  reorderCategories,
  seedDefaultCategories,
  CategoryProtectedError,
  CategoryDuplicateError,
  CategoryReorderError,
  DEFAULT_CATEGORIES,
  FALLBACK_CATEGORY_NAME,
} = await import('./db.js')

const baseDate = new Date('2026-01-01T00:00:00.000Z')

const taskRow = {
  id: 't1',
  title: 'タスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: new Date('2026-05-01T00:00:00.000Z'),
  memo: 'メモ',
  createdAt: baseDate,
  updatedAt: baseDate,
}

const userRow = {
  id: 'u1',
  email: 'test@example.com',
  name: 'テスト',
  passwordHash: 'hashed',
  createdAt: baseDate,
  updatedAt: baseDate,
}

const categoryRow = {
  id: 'c1',
  userId: 'u1',
  name: '案件・営業',
  sortOrder: 1,
  createdAt: baseDate,
}

beforeEach(() => {
  vi.clearAllMocks()
})

describe('error classes', () => {
  it('CategoryProtectedError は既定メッセージを持つ', () => {
    const e = new CategoryProtectedError()
    expect(e.message).toContain(FALLBACK_CATEGORY_NAME)
    expect(e.name).toBe('CategoryProtectedError')
  })

  it('CategoryDuplicateError は既定メッセージを持つ', () => {
    const e = new CategoryDuplicateError()
    expect(e.message).toContain('既に存在')
    expect(e.name).toBe('CategoryDuplicateError')
  })

  it('CategoryReorderError は引数のメッセージを持つ', () => {
    const e = new CategoryReorderError('過不足')
    expect(e.message).toBe('過不足')
    expect(e.name).toBe('CategoryReorderError')
  })

  it('DEFAULT_CATEGORIES は「その他」を含む', () => {
    expect(DEFAULT_CATEGORIES.some((c) => c.name === FALLBACK_CATEGORY_NAME)).toBe(true)
  })
})

describe('loadTasks', () => {
  it('フィルタなしで全件取得する', async () => {
    taskFindMany.mockResolvedValue([taskRow])
    const result = await loadTasks()
    expect(taskFindMany).toHaveBeenCalledWith({ where: {}, orderBy: { createdAt: 'desc' } })
    expect(result).toHaveLength(1)
    expect(result[0].id).toBe('t1')
    expect(result[0].dueDate).toBe('2026-05-01')
    expect(result[0].createdAt).toBe('2026-01-01T00:00:00.000Z')
  })

  it('userId/status/category フィルタを where に渡す', async () => {
    taskFindMany.mockResolvedValue([])
    await loadTasks({ userId: 'u1', status: 'todo', category: 'その他' })
    expect(taskFindMany).toHaveBeenCalledWith({
      where: { userId: 'u1', status: 'todo', category: 'その他' },
      orderBy: { createdAt: 'desc' },
    })
  })

  it('dueDate が null の場合 dueDate は null', async () => {
    taskFindMany.mockResolvedValue([{ ...taskRow, dueDate: null }])
    const result = await loadTasks()
    expect(result[0].dueDate).toBeNull()
  })
})

describe('createTask', () => {
  it('Task オブジェクトを Prisma に渡す', async () => {
    taskCreate.mockResolvedValue(taskRow)
    await createTask(
      {
        id: 't1',
        title: 'タスク',
        status: 'todo',
        priority: 'medium',
        category: '  その他  ',
        dueDate: '2026-05-01',
        memo: 'メモ',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'u1',
    )
    expect(taskCreate).toHaveBeenCalledTimes(1)
    const arg = taskCreate.mock.calls[0][0].data
    expect(arg.id).toBe('t1')
    expect(arg.userId).toBe('u1')
    expect(arg.category).toBe('その他') // trim される
    expect(arg.dueDate).toBeInstanceOf(Date)
  })

  it('dueDate が null なら null を渡す', async () => {
    taskCreate.mockResolvedValue(taskRow)
    await createTask(
      {
        id: 't1',
        title: 'タスク',
        status: 'todo',
        priority: 'medium',
        category: 'その他',
        dueDate: null,
        memo: '',
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
      'u1',
    )
    expect(taskCreate.mock.calls[0][0].data.dueDate).toBeNull()
  })
})

describe('updateTask', () => {
  it('対象タスクが存在しない場合は null を返す', async () => {
    taskFindFirst.mockResolvedValue(null)
    const result = await updateTask('t1', { status: 'done' }, 'u1')
    expect(result).toBeNull()
    expect(taskUpdate).not.toHaveBeenCalled()
  })

  it('指定されたフィールドだけを更新する', async () => {
    taskFindFirst.mockResolvedValue(taskRow)
    taskUpdate.mockResolvedValue({ ...taskRow, status: 'done' })
    await updateTask(
      't1',
      {
        status: 'done',
        title: '新タイトル',
        priority: 'high',
        memo: 'm',
        category: '  c  ',
        dueDate: '2026-12-31',
      },
      'u1',
    )
    const data = taskUpdate.mock.calls[0][0].data
    expect(data.status).toBe('done')
    expect(data.title).toBe('新タイトル')
    expect(data.priority).toBe('high')
    expect(data.memo).toBe('m')
    expect(data.category).toBe('c') // trim
    expect(data.dueDate).toBeInstanceOf(Date)
    expect(data.updatedAt).toBeInstanceOf(Date)
  })

  it('dueDate=null の更新も可能', async () => {
    taskFindFirst.mockResolvedValue(taskRow)
    taskUpdate.mockResolvedValue(taskRow)
    await updateTask('t1', { dueDate: null }, 'u1')
    expect(taskUpdate.mock.calls[0][0].data.dueDate).toBeNull()
  })
})

describe('deleteTask', () => {
  it('対象タスクが存在しない場合は null を返す', async () => {
    taskFindFirst.mockResolvedValue(null)
    const result = await deleteTask('t1', 'u1')
    expect(result).toBeNull()
    expect(taskDelete).not.toHaveBeenCalled()
  })

  it('存在する場合は削除して Task を返す', async () => {
    taskFindFirst.mockResolvedValue(taskRow)
    taskDelete.mockResolvedValue(taskRow)
    const result = await deleteTask('t1', 'u1')
    expect(taskDelete).toHaveBeenCalledWith({ where: { id: 't1' } })
    expect(result?.id).toBe('t1')
  })
})

describe('user functions', () => {
  it('findUserByEmail: 存在しなければ null', async () => {
    userFindUnique.mockResolvedValue(null)
    expect(await findUserByEmail('x@x')).toBeNull()
  })

  it('findUserByEmail: 存在すれば snake_case にマップ', async () => {
    userFindUnique.mockResolvedValue(userRow)
    const result = await findUserByEmail('test@example.com')
    expect(result?.password_hash).toBe('hashed')
    expect(result?.created_at).toBe('2026-01-01T00:00:00.000Z')
  })

  it('findUserById: 存在しなければ null', async () => {
    userFindUnique.mockResolvedValue(null)
    expect(await findUserById('x')).toBeNull()
  })

  it('findUserById: 存在すれば User を返す（passwordHash 含まない）', async () => {
    userFindUnique.mockResolvedValue(userRow)
    const result = await findUserById('u1')
    expect(result).toEqual({
      id: 'u1',
      email: 'test@example.com',
      name: 'テスト',
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z',
    })
  })

  it('createUser: termsAgreedAt が指定されればセット', async () => {
    userCreate.mockResolvedValue(userRow)
    await createUser('u1', 'test@example.com', 'テスト', 'hashed', '2026-01-01T00:00:00.000Z')
    const data = userCreate.mock.calls[0][0].data
    expect(data.termsAgreedAt).toBeInstanceOf(Date)
    expect(data.passwordHash).toBe('hashed')
  })

  it('createUser: termsAgreedAt 未指定なら null', async () => {
    userCreate.mockResolvedValue(userRow)
    await createUser('u1', 'a@a', 'n', 'h')
    expect(userCreate.mock.calls[0][0].data.termsAgreedAt).toBeNull()
  })

  it('updateUserPassword: 存在しなければ false', async () => {
    userFindUnique.mockResolvedValue(null)
    expect(await updateUserPassword('u1', 'h')).toBe(false)
    expect(userUpdate).not.toHaveBeenCalled()
  })

  it('updateUserPassword: 存在すれば更新して true', async () => {
    userFindUnique.mockResolvedValue(userRow)
    userUpdate.mockResolvedValue(userRow)
    expect(await updateUserPassword('u1', 'newhash')).toBe(true)
    expect(userUpdate.mock.calls[0][0].data.passwordHash).toBe('newhash')
  })

  it('deleteUser: 存在しなければ false', async () => {
    userFindUnique.mockResolvedValue(null)
    expect(await deleteUser('u1')).toBe(false)
    expect(userDelete).not.toHaveBeenCalled()
  })

  it('deleteUser: 存在すれば削除して true', async () => {
    userFindUnique.mockResolvedValue(userRow)
    userDelete.mockResolvedValue(userRow)
    expect(await deleteUser('u1')).toBe(true)
    expect(userDelete).toHaveBeenCalledWith({ where: { id: 'u1' } })
  })
})

describe('category functions', () => {
  it('seedDefaultCategories: DEFAULT_CATEGORIES 全件を upsert する', async () => {
    categoryUpsert.mockResolvedValue(categoryRow)
    await seedDefaultCategories('u1')
    expect(categoryUpsert).toHaveBeenCalledTimes(DEFAULT_CATEGORIES.length)
    for (const cat of DEFAULT_CATEGORIES) {
      expect(categoryUpsert).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { userId_name: { userId: 'u1', name: cat.name } },
          create: { userId: 'u1', name: cat.name, sortOrder: cat.sortOrder },
        }),
      )
    }
  })

  it('loadCategories: ユーザーのカテゴリを sortOrder 昇順で返す', async () => {
    categoryFindMany.mockResolvedValue([categoryRow])
    const result = await loadCategories('u1')
    expect(categoryFindMany).toHaveBeenCalledWith({
      where: { userId: 'u1' },
      orderBy: { sortOrder: 'asc' },
    })
    expect(result[0].id).toBe('c1')
  })

  it('loadCategoriesWithCounts: $transaction で取得しタスク数を集約する', async () => {
    dollarTransaction.mockResolvedValue([
      [categoryRow, { ...categoryRow, id: 'c2', name: 'その他' }],
      [
        { category: '案件・営業', _count: { _all: 3 } },
        { category: '存在しないカテゴリ', _count: { _all: 5 } },
      ],
    ])
    const result = await loadCategoriesWithCounts('u1')
    expect(dollarTransaction).toHaveBeenCalled()
    expect(result[0].taskCount).toBe(3)
    expect(result[1].taskCount).toBe(0) // その他: マッチなし
  })

  it('createCategory: sortOrder 未指定なら 0 を渡す', async () => {
    categoryCreate.mockResolvedValue(categoryRow)
    await createCategory('u1', '新規')
    expect(categoryCreate.mock.calls[0][0].data.sortOrder).toBe(0)
  })

  it('createCategory: sortOrder 指定なら渡す', async () => {
    categoryCreate.mockResolvedValue(categoryRow)
    await createCategory('u1', '新規', 5)
    expect(categoryCreate.mock.calls[0][0].data.sortOrder).toBe(5)
  })

  it('updateCategory: 存在しなければ null', async () => {
    categoryFindFirst.mockResolvedValue(null)
    expect(await updateCategory('c1', { name: 'x' }, 'u1')).toBeNull()
  })

  it('updateCategory: 「その他」のリネームは CategoryProtectedError', async () => {
    categoryFindFirst.mockResolvedValue({ ...categoryRow, name: FALLBACK_CATEGORY_NAME })
    await expect(updateCategory('c1', { name: '改名' }, 'u1')).rejects.toBeInstanceOf(
      CategoryProtectedError,
    )
  })

  it('updateCategory: 同名カテゴリが既にあれば CategoryDuplicateError', async () => {
    categoryFindFirst.mockResolvedValue(categoryRow)
    // tx を第一引数として callback を実行
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: {
          findFirst: vi.fn().mockResolvedValue({ id: 'cdup' }),
          update: vi.fn(),
        },
        task: { updateMany: vi.fn() },
      }),
    )
    await expect(updateCategory('c1', { name: '別名' }, 'u1')).rejects.toBeInstanceOf(
      CategoryDuplicateError,
    )
  })

  it('updateCategory: rename 時は tasks.category も更新する', async () => {
    categoryFindFirst.mockResolvedValue(categoryRow)
    const txCategoryFindFirst = vi.fn().mockResolvedValue(null)
    const txCategoryUpdate = vi.fn().mockResolvedValue({ ...categoryRow, name: '新名' })
    const txTaskUpdateMany = vi.fn()
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: { findFirst: txCategoryFindFirst, update: txCategoryUpdate },
        task: { updateMany: txTaskUpdateMany },
      }),
    )
    const result = await updateCategory('c1', { name: '新名' }, 'u1')
    expect(txTaskUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', category: '案件・営業' },
      data: { category: '新名' },
    })
    expect(txCategoryUpdate).toHaveBeenCalled()
    expect(result?.name).toBe('新名')
  })

  it('updateCategory: 名前変更がない sortOrder のみの更新でも tx は通る', async () => {
    categoryFindFirst.mockResolvedValue(categoryRow)
    const txCategoryUpdate = vi.fn().mockResolvedValue(categoryRow)
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: { findFirst: vi.fn(), update: txCategoryUpdate },
        task: { updateMany: vi.fn() },
      }),
    )
    await updateCategory('c1', { sortOrder: 9 }, 'u1')
    expect(txCategoryUpdate.mock.calls[0][0].data.sortOrder).toBe(9)
  })

  it('deleteCategory: 存在しなければ false', async () => {
    categoryFindFirst.mockResolvedValue(null)
    expect(await deleteCategory('c1', 'u1')).toBe(false)
  })

  it('deleteCategory: 「その他」は CategoryProtectedError', async () => {
    categoryFindFirst.mockResolvedValue({ ...categoryRow, name: FALLBACK_CATEGORY_NAME })
    await expect(deleteCategory('c1', 'u1')).rejects.toBeInstanceOf(CategoryProtectedError)
  })

  it('deleteCategory: 削除前に tasks を「その他」へ移動する', async () => {
    categoryFindFirst.mockResolvedValue(categoryRow)
    const txAggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: 4 } })
    const txUpsert = vi.fn().mockResolvedValue({})
    const txTaskUpdateMany = vi.fn()
    const txDelete = vi.fn()
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: { aggregate: txAggregate, upsert: txUpsert, delete: txDelete },
        task: { updateMany: txTaskUpdateMany },
      }),
    )
    expect(await deleteCategory('c1', 'u1')).toBe(true)
    expect(txUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId_name: { userId: 'u1', name: FALLBACK_CATEGORY_NAME } },
      }),
    )
    expect(txTaskUpdateMany).toHaveBeenCalledWith({
      where: { userId: 'u1', category: '案件・営業' },
      data: { category: FALLBACK_CATEGORY_NAME },
    })
    expect(txDelete).toHaveBeenCalledWith({ where: { id: 'c1' } })
  })

  it('deleteCategory: 既存の sortOrder が無い場合は 0 から始まる', async () => {
    categoryFindFirst.mockResolvedValue(categoryRow)
    const txAggregate = vi.fn().mockResolvedValue({ _max: { sortOrder: null } })
    const txUpsert = vi.fn().mockResolvedValue({})
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: { aggregate: txAggregate, upsert: txUpsert, delete: vi.fn() },
        task: { updateMany: vi.fn() },
      }),
    )
    await deleteCategory('c1', 'u1')
    expect(txUpsert.mock.calls[0][0].create.sortOrder).toBe(0)
  })

  it('reorderCategories: 件数不一致は CategoryReorderError', async () => {
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          update: vi.fn(),
        },
      }),
    )
    await expect(reorderCategories('u1', ['a'])).rejects.toBeInstanceOf(CategoryReorderError)
  })

  it('reorderCategories: 不正な ID は CategoryReorderError', async () => {
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          update: vi.fn(),
        },
      }),
    )
    await expect(reorderCategories('u1', ['a', 'z'])).rejects.toBeInstanceOf(CategoryReorderError)
  })

  it('reorderCategories: 重複 ID は CategoryReorderError', async () => {
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: {
          findMany: vi.fn().mockResolvedValue([{ id: 'a' }, { id: 'b' }]),
          update: vi.fn(),
        },
      }),
    )
    await expect(reorderCategories('u1', ['a', 'a'])).rejects.toBeInstanceOf(CategoryReorderError)
  })

  it('reorderCategories: 正常時は順序を更新して返す', async () => {
    const txUpdate = vi.fn()
    const reordered = [
      { ...categoryRow, id: 'b', sortOrder: 0 },
      { ...categoryRow, id: 'a', sortOrder: 1 },
    ]
    dollarTransaction.mockImplementation(async (cb: (tx: unknown) => Promise<unknown>) =>
      cb({
        category: {
          findMany: vi
            .fn()
            .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
            .mockResolvedValueOnce(reordered),
          update: txUpdate,
        },
      }),
    )
    const result = await reorderCategories('u1', ['b', 'a'])
    expect(txUpdate).toHaveBeenCalledTimes(2)
    expect(result).toHaveLength(2)
    expect(result[0].id).toBe('b')
  })
})
