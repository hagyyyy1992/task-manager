import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResetPasswordInteractor } from '@api/usecases/auth/reset-password/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { TokenRepository } from '@api/domain/repositories/TokenRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'

const NOW = new Date('2026-05-04T12:00:00.000Z')
const FRESH = '2026-05-04T11:00:00.000Z' // 1h 前 (有効)
const STALE = '2026-05-03T11:00:00.000Z' // 25h 前 (期限切れ)

const validToken = {
  id: 't1',
  userId: 'u1',
  scope: 'reset' as const,
  jti: 'jti-x',
  label: '',
  createdAt: FRESH,
  lastUsedAt: null,
  revokedAt: null,
}

let users: UserRepository
let tokenRepo: TokenRepository
let passwords: PasswordHashService
let interactor: ResetPasswordInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn(),
    findById: vi.fn(),
    findByIdWithSecret: vi.fn(),
    create: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
  }
  tokenRepo = {
    create: vi.fn(),
    findByJti: vi.fn().mockResolvedValue(validToken),
    listActiveByUser: vi.fn(),
    revoke: vi.fn(),
    revokeByJti: vi.fn().mockResolvedValue(true),
    touchLastUsed: vi.fn(),
  }
  passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    verify: vi.fn(),
  }
  interactor = new ResetPasswordInteractor(users, tokenRepo, passwords, () => NOW)
})

describe('ResetPasswordInteractor', () => {
  it('成功時は Token を revokeByJti で single-use 化し、updatePassword を呼ぶ', async () => {
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(true)
    expect(tokenRepo.revokeByJti).toHaveBeenCalledWith('jti-x')
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'new-hash')
    // race 対策: revoke が先 → password 更新が後
    const revokeOrder = vi.mocked(tokenRepo.revokeByJti).mock.invocationCallOrder[0]
    const updateOrder = vi.mocked(users.updatePassword).mock.invocationCallOrder[0]
    expect(revokeOrder).toBeLessThan(updateOrder)
  })

  it.each([
    ['invalid_input', { token: '', newPassword: 'newpassword1' }],
    ['invalid_input', { token: 'jti-x', newPassword: '' }],
    ['invalid_input', { token: 'jti-x', newPassword: 'short' }],
  ] as const)('入力 reason=%s', async (reason, body) => {
    const result = await interactor.execute(body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('Token 不在は invalid_token', async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({ token: 'unknown', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })

  it("scope='mcp' の Token を reset として使うと invalid_token", async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue({ ...validToken, scope: 'mcp' })
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('使用済み (revokedAt 設定済み) Token は invalid_token (single-use)', async () => {
    tokenRepo.findByJti = vi
      .fn()
      .mockResolvedValue({ ...validToken, revokedAt: '2026-05-04T11:30:00.000Z' })
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(tokenRepo.revokeByJti).not.toHaveBeenCalled()
  })

  it('createdAt が 24h より前の Token は期限切れで invalid_token', async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue({ ...validToken, createdAt: STALE })
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })

  it('revokeByJti が false (race で他リクエストが先に消費) は invalid_token', async () => {
    tokenRepo.revokeByJti = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('updatePassword が false (user 削除済み) なら invalid_token', async () => {
    users.updatePassword = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'newpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })
})
