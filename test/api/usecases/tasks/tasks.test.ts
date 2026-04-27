import { describe, it, expect, vi } from 'vitest'
import { ListTasksInteractor } from '@api/usecases/tasks/list/interactor.js'
import { CreateTaskInteractor } from '@api/usecases/tasks/create/interactor.js'
import { UpdateTaskInteractor } from '@api/usecases/tasks/update/interactor.js'
import { DeleteTaskInteractor } from '@api/usecases/tasks/delete/interactor.js'
import type { TaskRepository } from '@api/domain/repositories/TaskRepository.js'
import type { Task } from '@api/domain/entities/Task.js'

const mockTask: Task = {
  id: 't1',
  title: 'タスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null,
  memo: '',
  pinned: false,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function makeRepo(overrides: Partial<TaskRepository> = {}): TaskRepository {
  return {
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    ...overrides,
  }
}

describe('ListTasksInteractor', () => {
  it('repo.list({userId}) を呼ぶ', async () => {
    const repo = makeRepo({ list: vi.fn().mockResolvedValue([mockTask]) })
    const out = await new ListTasksInteractor(repo).execute('u1')
    expect(out).toEqual([mockTask])
    expect(repo.list).toHaveBeenCalledWith({ userId: 'u1' })
  })
})

describe('CreateTaskInteractor', () => {
  it('repo.create を呼んで task を返す', async () => {
    const repo = makeRepo({ create: vi.fn().mockResolvedValue(undefined) })
    const out = await new CreateTaskInteractor(repo).execute({ userId: 'u1', task: mockTask })
    expect(out).toBe(mockTask)
    expect(repo.create).toHaveBeenCalledWith(mockTask, 'u1')
  })
})

describe('UpdateTaskInteractor', () => {
  it('成功時は ok:true で更新後 task を返す', async () => {
    const updated = { ...mockTask, status: 'done' as const }
    const repo = makeRepo({ update: vi.fn().mockResolvedValue(updated) })
    const out = await new UpdateTaskInteractor(repo).execute({
      userId: 'u1',
      id: 't1',
      updates: { status: 'done' },
    })
    expect(out).toEqual({ ok: true, task: updated })
  })

  it('null なら not_found', async () => {
    const repo = makeRepo({ update: vi.fn().mockResolvedValue(null) })
    const out = await new UpdateTaskInteractor(repo).execute({
      userId: 'u1',
      id: 'x',
      updates: {},
    })
    expect(out).toEqual({ ok: false, reason: 'not_found' })
  })
})

describe('DeleteTaskInteractor', () => {
  it('成功時は ok:true で削除済 task を返す', async () => {
    const repo = makeRepo({ delete: vi.fn().mockResolvedValue(mockTask) })
    const out = await new DeleteTaskInteractor(repo).execute({ userId: 'u1', id: 't1' })
    expect(out).toEqual({ ok: true, task: mockTask })
  })

  it('null なら not_found', async () => {
    const repo = makeRepo({ delete: vi.fn().mockResolvedValue(null) })
    const out = await new DeleteTaskInteractor(repo).execute({ userId: 'u1', id: 'x' })
    expect(out).toEqual({ ok: false, reason: 'not_found' })
  })
})
