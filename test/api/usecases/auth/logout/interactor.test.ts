import { describe, it, expect, vi } from 'vitest'
import { LogoutInteractor } from '@api/usecases/auth/logout/interactor.js'

describe('LogoutInteractor', () => {
  it('revokeByJti(jti, userId) が true なら ok:true', async () => {
    const tokenRepo = {
      create: vi.fn(),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn().mockResolvedValue(true),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const result = await new LogoutInteractor(tokenRepo).execute({ userId: 'u1', jti: 'jti-1' })
    expect(tokenRepo.revokeByJti).toHaveBeenCalledWith('jti-1', 'u1')
    expect(result).toEqual({ ok: true })
  })

  it('revokeByJti が false なら not_found (他ユーザー / 既 revoke / 不在)', async () => {
    const tokenRepo = {
      create: vi.fn(),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn().mockResolvedValue(false),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const result = await new LogoutInteractor(tokenRepo).execute({ userId: 'u1', jti: 'jti-x' })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
