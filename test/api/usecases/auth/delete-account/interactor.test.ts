import { describe, it, expect, vi } from 'vitest'
import { DeleteAccountInteractor } from '@api/usecases/auth/delete-account/interactor.js'

describe('DeleteAccountInteractor', () => {
  it('成功時は ok:true', async () => {
    const users = {
      delete: vi.fn().mockResolvedValue(true),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updatePassword: vi.fn(),
    }
    const result = await new DeleteAccountInteractor(users).execute('u1')
    expect(result).toEqual({ ok: true })
    expect(users.delete).toHaveBeenCalledWith('u1')
  })

  it('not_found を返す', async () => {
    const users = {
      delete: vi.fn().mockResolvedValue(false),
      findById: vi.fn(),
      findByEmail: vi.fn(),
      create: vi.fn(),
      updatePassword: vi.fn(),
    }
    const result = await new DeleteAccountInteractor(users).execute('u1')
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
