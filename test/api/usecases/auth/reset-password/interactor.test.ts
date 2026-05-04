import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ResetPasswordInteractor } from '@api/usecases/auth/reset-password/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { TokenRepository } from '@api/domain/repositories/TokenRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'

const NOW = new Date('2026-05-04T12:00:00.000Z')
const FRESH = '2026-05-04T11:30:00.000Z' // 30分前 (有効)
const STALE = '2026-05-04T10:00:00.000Z' // 2h前 (1h TTL で期限切れ)

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

const testUser = {
  id: 'u1',
  email: 'user@example.com',
  name: 'Test',
  passwordChangedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

// 12文字以上・英字+数字含む・email ローカル部('user')を含まない
const VALID_PASSWORD = 'newPassword12'

let users: UserRepository
let tokenRepo: TokenRepository
let passwords: PasswordHashService
let interactor: ResetPasswordInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(testUser),
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
  interactor = new ResetPasswordInteractor(users, tokenRepo, passwords, undefined, () => NOW)
})

describe('ResetPasswordInteractor', () => {
  it('成功時は Token を revokeByJti で single-use 化し、updatePassword を呼ぶ', async () => {
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(true)
    expect(tokenRepo.revokeByJti).toHaveBeenCalledWith('jti-x')
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'new-hash')
    // race 対策: revoke が先 → password 更新が後
    const revokeOrder = vi.mocked(tokenRepo.revokeByJti).mock.invocationCallOrder[0]
    const updateOrder = vi.mocked(users.updatePassword).mock.invocationCallOrder[0]
    expect(revokeOrder).toBeLessThan(updateOrder)
  })

  it.each([
    ['invalid_input', { token: '', newPassword: VALID_PASSWORD }],
    ['invalid_input', { token: 'jti-x', newPassword: '' }],
    ['invalid_input', { token: 'jti-x', newPassword: 'short' }],
    ['invalid_input', { token: 'jti-x', newPassword: '123456789012' }], // 英字なし
    ['invalid_input', { token: 'jti-x', newPassword: 'abcdefghijkl' }], // 数字なし
  ] as const)('入力 reason=%s (%s)', async (reason, body) => {
    const result = await interactor.execute(body)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('パスワードが 12 文字未満は invalid_input', async () => {
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'Short1' })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_input')
      expect(result.message).toContain('12')
    }
  })

  it('パスワードに email ローカル部を含む場合は invalid_input', async () => {
    // testUser.email = 'user@example.com' → local part = 'user'
    const result = await interactor.execute({ token: 'jti-x', newPassword: 'myuserpassword1' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
    // revokeByJti は呼ばれない
    expect(tokenRepo.revokeByJti).not.toHaveBeenCalled()
  })

  it('漏洩 PW は invalid_input で拒否 (breachedChecker あり)', async () => {
    const checker = { isBreached: vi.fn().mockResolvedValue(true) }
    const i = new ResetPasswordInteractor(users, tokenRepo, passwords, checker, () => NOW)
    const result = await i.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_input')
      expect(result.message).toContain('breach')
    }
    expect(tokenRepo.revokeByJti).not.toHaveBeenCalled()
  })

  it('Token 不在は invalid_token', async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({ token: 'unknown', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })

  it("scope='mcp' の Token を reset として使うと invalid_token", async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue({ ...validToken, scope: 'mcp' })
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('使用済み (revokedAt 設定済み) Token は invalid_token (single-use)', async () => {
    tokenRepo.findByJti = vi
      .fn()
      .mockResolvedValue({ ...validToken, revokedAt: '2026-05-04T11:30:00.000Z' })
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(tokenRepo.revokeByJti).not.toHaveBeenCalled()
  })

  it('createdAt が 1h より前の Token は期限切れで invalid_token', async () => {
    tokenRepo.findByJti = vi.fn().mockResolvedValue({ ...validToken, createdAt: STALE })
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })

  it('revokeByJti が false (race で他リクエストが先に消費) は invalid_token', async () => {
    tokenRepo.revokeByJti = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('updatePassword が false (user 削除済み) なら invalid_token', async () => {
    users.updatePassword = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ token: 'jti-x', newPassword: VALID_PASSWORD })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_token')
  })
})
