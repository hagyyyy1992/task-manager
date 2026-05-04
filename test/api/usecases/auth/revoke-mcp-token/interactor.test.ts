import { describe, it, expect, vi } from 'vitest'
import { RevokeMcpTokenInteractor } from '@api/usecases/auth/revoke-mcp-token/interactor.js'

describe('RevokeMcpTokenInteractor', () => {
  it('リポジトリ.revoke が true なら ok:true', async () => {
    const repo = {
      revoke: vi.fn().mockResolvedValue(true),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const result = await new RevokeMcpTokenInteractor(repo).execute({ userId: 'u1', tokenId: 't1' })
    expect(repo.revoke).toHaveBeenCalledWith('t1', 'u1')
    expect(result).toEqual({ ok: true })
  })

  it('リポジトリ.revoke が false なら not_found (他ユーザー / 既 revoke / 不在)', async () => {
    const repo = {
      revoke: vi.fn().mockResolvedValue(false),
      findByJti: vi.fn(),
      listActiveByUser: vi.fn(),
      create: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const result = await new RevokeMcpTokenInteractor(repo).execute({ userId: 'u1', tokenId: 't1' })
    expect(result).toEqual({ ok: false, reason: 'not_found' })
  })
})
