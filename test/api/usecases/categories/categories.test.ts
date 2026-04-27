import { describe, it, expect, vi } from 'vitest'
import { ListCategoriesInteractor } from '@api/usecases/categories/list/interactor.js'
import { CreateCategoryInteractor } from '@api/usecases/categories/create/interactor.js'
import { UpdateCategoryInteractor } from '@api/usecases/categories/update/interactor.js'
import { DeleteCategoryInteractor } from '@api/usecases/categories/delete/interactor.js'
import { ReorderCategoriesInteractor } from '@api/usecases/categories/reorder/interactor.js'
import { CategoryProtectedError } from '@api/domain/exceptions/CategoryProtectedError.js'
import { CategoryDuplicateError } from '@api/domain/exceptions/CategoryDuplicateError.js'
import { CategoryReorderError } from '@api/domain/exceptions/CategoryReorderError.js'
import type { CategoryRepository } from '@api/domain/repositories/CategoryRepository.js'

const mockCategory = {
  id: 'c1',
  userId: 'u1',
  name: 'カテゴリ',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function makeRepo(overrides: Partial<CategoryRepository> = {}): CategoryRepository {
  return {
    listWithCounts: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    seedDefaults: vi.fn(),
    ...overrides,
  }
}

describe('ListCategoriesInteractor', () => {
  it('listWithCounts を呼ぶ', async () => {
    const repo = makeRepo({ listWithCounts: vi.fn().mockResolvedValue([]) })
    await new ListCategoriesInteractor(repo).execute('u1')
    expect(repo.listWithCounts).toHaveBeenCalledWith('u1')
  })
})

describe('CreateCategoryInteractor', () => {
  it('成功時は ok:true で category を返す', async () => {
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(mockCategory) })
    const result = await new CreateCategoryInteractor(repo).execute({
      userId: 'u1',
      name: '  新規  ',
      sortOrder: 2,
    })
    expect(result).toEqual({ ok: true, category: mockCategory })
    expect(repo.create).toHaveBeenCalledWith('u1', '新規', 2)
  })

  it('空文字 name は invalid_input', async () => {
    const repo = makeRepo()
    const result = await new CreateCategoryInteractor(repo).execute({
      userId: 'u1',
      name: '   ',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('name is required')
    expect(repo.create).not.toHaveBeenCalled()
  })

  it.each([-1, 1.5, 'one' as unknown as number])(
    '不正な sortOrder=%s は invalid_input',
    async (v) => {
      const repo = makeRepo()
      const result = await new CreateCategoryInteractor(repo).execute({
        userId: 'u1',
        name: 'x',
        sortOrder: v,
      })
      expect(result.ok).toBe(false)
      if (!result.ok) expect(result.message).toContain('sortOrder')
    },
  )
})

describe('UpdateCategoryInteractor', () => {
  it('成功時は ok:true で更新後カテゴリを返す', async () => {
    const updated = { ...mockCategory, name: '改名' }
    const repo = makeRepo({ update: vi.fn().mockResolvedValue(updated) })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: '  改名  ',
    })
    expect(result).toEqual({ ok: true, category: updated })
    expect(repo.update).toHaveBeenCalledWith('c1', { name: '改名', sortOrder: undefined }, 'u1')
  })

  it('repo が null なら not_found', async () => {
    const repo = makeRepo({ update: vi.fn().mockResolvedValue(null) })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'x',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('空文字 name は invalid_input', async () => {
    const repo = makeRepo()
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: '   ',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
    expect(repo.update).not.toHaveBeenCalled()
  })

  it('CategoryProtectedError → protected', async () => {
    const repo = makeRepo({
      update: vi.fn().mockRejectedValue(new CategoryProtectedError('「その他」は変更できません')),
    })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('protected')
  })

  it('CategoryDuplicateError → duplicate', async () => {
    const repo = makeRepo({ update: vi.fn().mockRejectedValue(new CategoryDuplicateError()) })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('duplicate')
  })

  it('Prisma P2002 (target=name) → duplicate', async () => {
    const repo = makeRepo({
      update: vi.fn().mockRejectedValue(
        Object.assign(new Error('Unique'), {
          code: 'P2002',
          meta: { target: ['userId', 'name'] },
        }),
      ),
    })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('duplicate')
  })

  it('Prisma P2002 (他カラム) は再 throw → 500 系', async () => {
    const repo = makeRepo({
      update: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('Unique'), { code: 'P2002', meta: { target: ['other'] } }),
        ),
    })
    await expect(
      new UpdateCategoryInteractor(repo).execute({ userId: 'u1', id: 'c1', name: 'x' }),
    ).rejects.toThrow('Unique')
  })

  it('未知の例外は再 throw', async () => {
    const repo = makeRepo({ update: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(
      new UpdateCategoryInteractor(repo).execute({ userId: 'u1', id: 'c1', name: 'x' }),
    ).rejects.toThrow('boom')
  })

  it('Prisma P2002 (target=string で name 含む) → duplicate', async () => {
    const repo = makeRepo({
      update: vi
        .fn()
        .mockRejectedValue(
          Object.assign(new Error('U'), { code: 'P2002', meta: { target: 'name' } }),
        ),
    })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('duplicate')
  })

  it('Prisma P2002 (target 無し) → duplicate（安全側）', async () => {
    const repo = makeRepo({
      update: vi.fn().mockRejectedValue(Object.assign(new Error('U'), { code: 'P2002' })),
    })
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      name: 'x',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('duplicate')
  })

  it('null/string が throw された場合は再 throw', async () => {
    const repo = makeRepo({ update: vi.fn().mockRejectedValue('plain string') })
    await expect(
      new UpdateCategoryInteractor(repo).execute({ userId: 'u1', id: 'c1', name: 'x' }),
    ).rejects.toBe('plain string')
  })

  it('不正な sortOrder は invalid_input', async () => {
    const repo = makeRepo()
    const result = await new UpdateCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'c1',
      sortOrder: -1,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('sortOrder')
  })
})

describe('DeleteCategoryInteractor', () => {
  it('成功時は ok:true', async () => {
    const repo = makeRepo({ delete: vi.fn().mockResolvedValue(true) })
    const result = await new DeleteCategoryInteractor(repo).execute({ userId: 'u1', id: 'c1' })
    expect(result).toEqual({ ok: true })
  })

  it('false なら not_found', async () => {
    const repo = makeRepo({ delete: vi.fn().mockResolvedValue(false) })
    const result = await new DeleteCategoryInteractor(repo).execute({ userId: 'u1', id: 'x' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('CategoryProtectedError → protected', async () => {
    const repo = makeRepo({ delete: vi.fn().mockRejectedValue(new CategoryProtectedError()) })
    const result = await new DeleteCategoryInteractor(repo).execute({
      userId: 'u1',
      id: 'sonota',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('protected')
  })

  it('未知の例外は再 throw', async () => {
    const repo = makeRepo({ delete: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(
      new DeleteCategoryInteractor(repo).execute({ userId: 'u1', id: 'c1' }),
    ).rejects.toThrow('boom')
  })
})

describe('ReorderCategoriesInteractor', () => {
  it('成功時は ok:true', async () => {
    const repo = makeRepo({ reorder: vi.fn().mockResolvedValue([mockCategory]) })
    const result = await new ReorderCategoriesInteractor(repo).execute({
      userId: 'u1',
      ids: ['c1'],
    })
    expect(result).toEqual({ ok: true, categories: [mockCategory] })
  })

  it('ids が配列でない場合は invalid_input', async () => {
    const repo = makeRepo()
    const result = await new ReorderCategoriesInteractor(repo).execute({
      userId: 'u1',
      ids: 'not-array',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
  })

  it('CategoryReorderError → invalid_input', async () => {
    const repo = makeRepo({
      reorder: vi.fn().mockRejectedValue(new CategoryReorderError('過不足あり')),
    })
    const result = await new ReorderCategoriesInteractor(repo).execute({
      userId: 'u1',
      ids: ['c1'],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('過不足')
  })

  it('未知の例外は再 throw', async () => {
    const repo = makeRepo({ reorder: vi.fn().mockRejectedValue(new Error('boom')) })
    await expect(
      new ReorderCategoriesInteractor(repo).execute({ userId: 'u1', ids: ['c1'] }),
    ).rejects.toThrow('boom')
  })

  it('ids 内に文字列以外が混ざっていれば invalid_input', async () => {
    const repo = makeRepo()
    const result = await new ReorderCategoriesInteractor(repo).execute({
      userId: 'u1',
      ids: ['a', 1],
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
  })

  it('ids が上限 (200) 超なら invalid_input', async () => {
    const repo = makeRepo()
    const ids = Array.from({ length: 201 }, (_, i) => `c${i}`)
    const result = await new ReorderCategoriesInteractor(repo).execute({ userId: 'u1', ids })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('limit')
    expect(repo.reorder).not.toHaveBeenCalled()
  })
})
