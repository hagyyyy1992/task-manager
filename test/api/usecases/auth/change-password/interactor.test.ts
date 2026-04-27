import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ChangePasswordInteractor } from '@api/usecases/auth/change-password/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'

const mockMe = {
  id: 'u1',
  email: 'a@b.com',
  name: 'X',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}
const mockSecret = { ...mockMe, passwordHash: 'salt:hash' }

let users: UserRepository
let passwords: PasswordHashService
let interactor: ChangePasswordInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn().mockResolvedValue(mockSecret),
    findById: vi.fn().mockResolvedValue(mockMe),
    create: vi.fn(),
    updatePassword: vi.fn().mockResolvedValue(true),
    delete: vi.fn(),
  }
  passwords = {
    hash: vi.fn().mockResolvedValue('new-hash'),
    verify: vi.fn().mockResolvedValue(true),
  }
  interactor = new ChangePasswordInteractor(users, passwords)
})

describe('ChangePasswordInteractor', () => {
  it('成功時は ok:true、updatePassword に新ハッシュを渡す', async () => {
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw1',
      newPassword: 'newpassword1',
    })
    expect(result.ok).toBe(true)
    expect(users.updatePassword).toHaveBeenCalledWith('u1', 'new-hash')
  })

  it.each([
    ['invalid_input', { currentPassword: '', newPassword: 'newpassword1' }],
    ['invalid_input', { currentPassword: 'pw', newPassword: 'short' }],
  ] as const)('reason=%s', async (reason, body) => {
    const result = await interactor.execute({ userId: 'u1', ...body })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe(reason)
  })

  it('findById が null なら unauthorized', async () => {
    users.findById = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'newpassword1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('unauthorized')
  })

  it('findByEmail が null なら not_found', async () => {
    users.findByEmail = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'pw',
      newPassword: 'newpassword1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('パスワード不一致は wrong_password', async () => {
    passwords.verify = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({
      userId: 'u1',
      currentPassword: 'wrong',
      newPassword: 'newpassword1',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('wrong_password')
  })
})
