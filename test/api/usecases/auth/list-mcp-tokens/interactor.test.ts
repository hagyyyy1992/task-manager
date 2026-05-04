import { describe, it, expect, vi } from 'vitest'
import { ListMcpTokensInteractor } from '@api/usecases/auth/list-mcp-tokens/interactor.js'

describe('ListMcpTokensInteractor', () => {
  it('リポジトリの listActiveByUser を呼び結果を tokens に詰めて返す', async () => {
    const fakeTokens = [
      {
        id: 't1',
        userId: 'u1',
        scope: 'mcp' as const,
        jti: 'j1',
        label: 'macbook',
        createdAt: '2026-04-27T00:00:00.000Z',
        lastUsedAt: null,
        revokedAt: null,
      },
    ]
    const repo = {
      listActiveByUser: vi.fn().mockResolvedValue(fakeTokens),
      create: vi.fn(),
      findByJti: vi.fn(),
      revoke: vi.fn(),
      revokeByJti: vi.fn(),
      revokeAllByUserAndScope: vi.fn(),
      touchLastUsed: vi.fn(),
    }
    const result = await new ListMcpTokensInteractor(repo).execute('u1')
    expect(repo.listActiveByUser).toHaveBeenCalledWith('u1')
    expect(result).toEqual({ tokens: fakeTokens })
  })
})
