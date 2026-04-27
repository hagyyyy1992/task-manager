import { describe, it, expect, vi } from 'vitest'
import { MeInteractor } from '@api/usecases/auth/me/interactor.js'

const mockUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'X',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

describe('MeInteractor', () => {
  it('ユーザーを返す', async () => {
    const users = {
      findById: vi.fn().mockResolvedValue(mockUser),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updatePassword: vi.fn(),
      delete: vi.fn(),
    }
    const result = await new MeInteractor(users).execute('u1')
    expect(result).toEqual({ ok: true, user: mockUser })
  })

  it('not_found を返す', async () => {
    const users = {
      findById: vi.fn().mockResolvedValue(null),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updatePassword: vi.fn(),
      delete: vi.fn(),
    }
    const result = await new MeInteractor(users).execute('u1')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
