import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChangePasswordInteractor } from '@api/usecases/auth/change-password/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'
import type { BreachedPasswordChecker } from '@api/domain/services/BreachedPasswordChecker.js'

const mockMe = {
  id: 'u1',
  email: 'alice@example.com',
  name: 'X',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const mockSecret = { ...mockMe, passwordHash: 'salt:hash' }

let users: UserRepository
let passwords: PasswordHashService
let breachedChecker: BreachedPasswordChecker
let interactor: ChangePasswordInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn(),
    findById: vi.fn().mockResolvedValue(mockMe),
    findByIdWithSecret: vi.fn().mockResolvedValue(mockSecret),
    create: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
  }
  passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    verify: vi.fn().mockResolvedValue(true),
  }
  breachedChecker = { isBreached: vi.fn().mockResolvedValue(false) }
  interactor = new ChangePasswordInteractor(users, passwords, async () => false, breachedChecker)
})

describe('ChangePasswordInteractor', () => {
  it('成功時は ok:true、updatePassword に新ハッシュを渡す', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw1',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(true)
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'new-hash')
    expect(breachedChecker.isBreached).toHaveBeenCalledWith('NewStrongPass123')
  })

  it('currentPassword/newPassword 欠落は invalid_input', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: '',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
  })

  it('短い新パスワード(12文字未満)は invalid_input (issue #61)', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'Short1!',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.reason).toBe('invalid_input')
      expect(result.message).toContain('12 characters')
    }
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('英字のみ(数字なし)新パスワードは invalid_input (issue #61)', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'OnlyLettersHere',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('letters and digits')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('メールローカル部を含む新パスワードは invalid_input (issue #61)', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'aliceStrong123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('email local part')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('HIBP で漏洩している新パスワードは invalid_input (issue #61)', async () => {
    breachedChecker.isBreached = vi.fn().mockResolvedValue(true)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('data breach')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })

  it('HIBP が例外を投げても fail-open で変更は通る (issue #61)', async () => {
    breachedChecker.isBreached = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(true)
    expect(users.updatePassword).toHaveBeenCalled()
  })

  it('findByIdWithSecret が null なら unauthorized', async () => {
    users.findByIdWithSecret = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unauthorized')
  })

  it('パスワード不一致は wrong_password', async () => {
    passwords.verify = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'wrong',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('wrong_password')
  })

  it('デモユーザーは demo_forbidden で拒否され updatePassword は呼ばれない (issue #57)', async () => {
    const isDemoUser = vi.fn().mockResolvedValue(true)
    const demoInteractor = new ChangePasswordInteractor(
      users,
      passwords,
      isDemoUser,
      breachedChecker,
    )
    const result = await demoInteractor.execute({
      userId: 'u1',
      currentPassword: 'pw1',
      newPassword: 'NewStrongPass123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('demo_forbidden')
    expect(isDemoUser).toHaveBeenCalledWith('u1')
    expect(users.updatePassword).not.toHaveBeenCalled()
  })
})
