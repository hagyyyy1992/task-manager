import { describe, it, expect, vi } from 'vitest'
import { RevokeAllSessionsInteractor } from '@api/usecases/auth/revoke-all-sessions/interactor.js'

describe('RevokeAllSessionsInteractor', () => {
  it('revokeAllByUserAndScope を scope=session で呼び revokedCount を返す', async () => {
    const tokenRepo = {
      create: vi.fn(),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn().mockResolvedValue(5),
      touchLastUsed: vi.fn(),
    }
    const result = await new RevokeAllSessionsInteractor(tokenRepo).execute({ userId: 'u1' })
    expect(tokenRepo.revokeAllByUserAndScope).toHaveBeenCalledWith('u1', 'session')
    expect(result).toEqual({ ok: true, revokedCount: 5 })
  })

  it('セッション 0 件でも ok:true (revokedCount=0)', async () => {
    const tokenRepo = {
      create: vi.fn(),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn().mockResolvedValue(0),
      touchLastUsed: vi.fn(),
    }
    const result = await new RevokeAllSessionsInteractor(tokenRepo).execute({ userId: 'u1' })
    expect(result).toEqual({ ok: true, revokedCount: 0 })
  })
})
