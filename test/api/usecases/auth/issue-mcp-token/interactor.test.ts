import { describe, it, expect, vi } from 'vitest'
import { IssueMcpTokenInteractor } from '@api/usecases/auth/issue-mcp-token/interactor.js'

function makeRepo() {
  return {
    create: vi.fn(async (input) => ({
      id: input.id,
      userId: input.userId,
      scope: 'mcp' as const,
      jti: input.jti,
      label: input.label,
      createdAt: '2026-04-27T00:00:00.000Z',
      lastUsedAt: null,
      revokedAt: null,
    })),
    findByJti: vi.fn(),
    listActiveByUser: vi.fn(),
    revoke: vi.fn(),
    revokeByJti: vi.fn(),
    touchLastUsed: vi.fn(),
  }
}

describe('IssueMcpTokenInteractor', () => {
  it('jti を生成して TokenService.issueLongLived と TokenRepository.create を同じ jti で呼ぶ', async () => {
    const repo = makeRepo()
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn().mockResolvedValue('the-jwt'),
      verify: vi.fn(),
    }
    const result = await new IssueMcpTokenInteractor(tokens, repo).execute({
      userId: 'u1',
      label: 'macbook',
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.token).toBe('the-jwt')
    // 同じ jti が両者に渡る
    const jtiToService = tokens.issueLongLived.mock.calls[0][1]
    const createArg = repo.create.mock.calls[0][0]
    expect(jtiToService).toBe(createArg.jti)
    expect(createArg.userId).toBe('u1')
    expect(createArg.label).toBe('macbook')
    expect(createArg.scope).toBe('mcp')
  })

  it('label を trim する。空文字は許容', async () => {
    const repo = makeRepo()
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn().mockResolvedValue('jwt'),
      verify: vi.fn(),
    }
    await new IssueMcpTokenInteractor(tokens, repo).execute({ userId: 'u1', label: '  hello  ' })
    expect(repo.create.mock.calls[0][0].label).toBe('hello')

    await new IssueMcpTokenInteractor(tokens, repo).execute({ userId: 'u1' })
    expect(repo.create.mock.calls[1][0].label).toBe('')
  })

  it('label が 100 文字超なら invalid_input', async () => {
    const repo = makeRepo()
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn().mockResolvedValue('jwt'),
      verify: vi.fn(),
    }
    const result = await new IssueMcpTokenInteractor(tokens, repo).execute({
      userId: 'u1',
      label: 'a'.repeat(101),
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('invalid_input')
    expect(tokens.issueLongLived).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })

  it('デモユーザーは demo_forbidden で拒否され issueLongLived/create は呼ばれない (issue #57)', async () => {
    const repo = makeRepo()
    const tokens = {
      issue: vi.fn(),
      issueLongLived: vi.fn().mockResolvedValue('jwt'),
      verify: vi.fn(),
    }
    const isDemoUser = vi.fn().mockResolvedValue(true)
    const result = await new IssueMcpTokenInteractor(tokens, repo, isDemoUser).execute({
      userId: 'u1',
      label: 'macbook',
    })
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.reason).toBe('demo_forbidden')
    expect(isDemoUser).toHaveBeenCalledWith('u1')
    expect(tokens.issueLongLived).not.toHaveBeenCalled()
    expect(repo.create).not.toHaveBeenCalled()
  })
})
