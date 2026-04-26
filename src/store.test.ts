import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  loadTasks,
  loadTask,
  apiCreateTask,
  apiUpdateTask,
  apiDeleteTask,
  loadCategories,
  apiCreateCategory,
  apiUpdateCategory,
  apiDeleteCategory,
  apiReorderCategories,
  generateId,
} from './store'
import type { Task, Category } from './types'

const fetchMock = vi.fn()

const mockTask: Task = {
  id: 't1',
  title: 'タスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null,
  memo: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const mockCategory: Category = {
  id: 'c1',
  userId: 'u1',
  name: 'その他',
  sortOrder: 0,
  createdAt: '2026-01-01T00:00:00.000Z',
}

function ok(body: unknown) {
  return { ok: true, status: 200, json: async () => body }
}
function ng(status: number, body?: unknown) {
  return {
    ok: false,
    status,
    json: async () => {
      if (body === undefined) throw new SyntaxError('Unexpected')
      return body
    },
  }
}

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset()
  localStorage.clear()
})

describe('generateId', () => {
  it('UUID 形式の文字列を返す', () => {
    const id = generateId()
    expect(id).toMatch(/^[0-9a-f-]{36}$/i)
  })
})

describe('tasks API', () => {
  it('loadTasks: 成功', async () => {
    fetchMock.mockResolvedValue(ok([mockTask]))
    const result = await loadTasks()
    expect(result).toEqual([mockTask])
    expect(fetchMock).toHaveBeenCalledWith('/api/tasks', expect.any(Object))
  })

  it('loadTasks: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(loadTasks()).rejects.toThrow('Failed to load tasks: 500')
  })

  it('loadTask: 該当 ID が見つかればそれを返す', async () => {
    fetchMock.mockResolvedValue(ok([mockTask, { ...mockTask, id: 't2' }]))
    expect(await loadTask('t2')).toEqual({ ...mockTask, id: 't2' })
  })

  it('loadTask: 見つからなければ null', async () => {
    fetchMock.mockResolvedValue(ok([mockTask]))
    expect(await loadTask('nope')).toBeNull()
  })

  it('apiCreateTask: 成功時は何も返さない', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await expect(apiCreateTask(mockTask)).resolves.toBeUndefined()
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/tasks')
    expect(call[1].method).toBe('POST')
    expect(JSON.parse(call[1].body)).toEqual(mockTask)
  })

  it('apiCreateTask: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(apiCreateTask(mockTask)).rejects.toThrow('Failed to create task: 500')
  })

  it('apiUpdateTask: 成功時は更新後タスクを返す', async () => {
    const updated = { ...mockTask, status: 'done' as const }
    fetchMock.mockResolvedValue(ok(updated))
    expect(await apiUpdateTask('t1', { status: 'done' })).toEqual(updated)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/t1',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('apiUpdateTask: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(404))
    await expect(apiUpdateTask('t1', { status: 'done' })).rejects.toThrow(
      'Failed to update task: 404',
    )
  })

  it('apiDeleteTask: 成功時は何も返さない', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await expect(apiDeleteTask('t1')).resolves.toBeUndefined()
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/tasks/t1',
      expect.objectContaining({ method: 'DELETE' }),
    )
  })

  it('apiDeleteTask: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(apiDeleteTask('t1')).rejects.toThrow('Failed to delete task: 500')
  })
})

describe('categories API', () => {
  it('loadCategories: 成功', async () => {
    fetchMock.mockResolvedValue(ok([mockCategory]))
    expect(await loadCategories()).toEqual([mockCategory])
  })

  it('loadCategories: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(loadCategories()).rejects.toThrow('Failed to load categories: 500')
  })

  it('apiCreateCategory: name と sortOrder を送信', async () => {
    fetchMock.mockResolvedValue(ok(mockCategory))
    expect(await apiCreateCategory('新規', 3)).toEqual(mockCategory)
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({ name: '新規', sortOrder: 3 })
  })

  it('apiCreateCategory: 失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(apiCreateCategory('x')).rejects.toThrow('Failed to create category: 500')
  })

  it('apiUpdateCategory: 成功時はカテゴリを返す', async () => {
    fetchMock.mockResolvedValue(ok(mockCategory))
    expect(await apiUpdateCategory('c1', { name: '改名' })).toEqual(mockCategory)
  })

  it('apiUpdateCategory: 失敗 + body.error をエラーメッセージに含める', async () => {
    fetchMock.mockResolvedValue(ng(409, { error: '同じ名前のカテゴリが既に存在します' }))
    await expect(apiUpdateCategory('c1', { name: 'x' })).rejects.toThrow(
      '同じ名前のカテゴリが既に存在します',
    )
  })

  it('apiUpdateCategory: 失敗 + body の error が無ければ既定メッセージ', async () => {
    fetchMock.mockResolvedValue(ng(500, {}))
    await expect(apiUpdateCategory('c1', { name: 'x' })).rejects.toThrow(
      'Failed to update category: 500',
    )
  })

  it('apiUpdateCategory: 失敗 + body が JSON でない場合も既定メッセージ', async () => {
    fetchMock.mockResolvedValue(ng(500))
    await expect(apiUpdateCategory('c1', { name: 'x' })).rejects.toThrow(
      'Failed to update category: 500',
    )
  })

  it('apiDeleteCategory: 成功時は何も返さない', async () => {
    fetchMock.mockResolvedValue(ok({}))
    await expect(apiDeleteCategory('c1')).resolves.toBeUndefined()
  })

  it('apiDeleteCategory: 失敗 + body.error 含めて Throw', async () => {
    fetchMock.mockResolvedValue(ng(400, { error: '「その他」カテゴリは削除できません' }))
    await expect(apiDeleteCategory('c1')).rejects.toThrow('「その他」カテゴリは削除できません')
  })

  it('apiReorderCategories: ids を渡し、レスポンスを返す', async () => {
    fetchMock.mockResolvedValue(ok([mockCategory]))
    expect(await apiReorderCategories(['c1'])).toEqual([mockCategory])
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/categories/reorder',
      expect.objectContaining({ method: 'PATCH' }),
    )
  })

  it('apiReorderCategories: 失敗 + error メッセージを Throw', async () => {
    fetchMock.mockResolvedValue(ng(400, { error: '過不足あり' }))
    await expect(apiReorderCategories(['c1'])).rejects.toThrow('過不足あり')
  })
})
