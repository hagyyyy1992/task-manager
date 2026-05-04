import { describe, it, expect, vi, beforeEach } from 'vitest'
import { DeleteAccountInteractor } from '@api/usecases/auth/delete-account/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'

const mockSecret = {
  id: 'u1',
  email: 'a@b.com',
  name: 'X',
  passwordHash: 'salt:hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

let users: UserRepository
let passwords: PasswordHashService
let interactor: DeleteAccountInteractor

beforeEach(() => {
  vi.spyOn(console, 'info').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  users = {
    delete: vi.fn().mockResolvedValue(true),
    findById: vi.fn(),
    findByEmail: vi.fn(),
    findByIdWithSecret: vi.fn().mockResolvedValue(mockSecret),
    create: vi.fn(),
    updatePassword: vi.fn(),
  }
  passwords = { hash: vi.fn(), verify: vi.fn().mockResolvedValue(true) }
  interactor = new DeleteAccountInteractor(users, passwords)
})

describe('DeleteAccountInteractor', () => {
  it('成功時は ok:true、users.delete が呼ばれる', async () => {
    const result = await interactor.execute({ userId: 'u1', currentPassword: 'pw' })
    expect(result).toEqual({ ok: true })
    expect(users.delete).toHaveBeenCalledWith('u1')
  })

  it('currentPassword 未指定は invalid_input', async () => {
    const result = await interactor.execute({ userId: 'u1', currentPassword: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
    expect(users.delete).not.toHaveBeenCalled()
  })

  it('ユーザーが見つからない場合は not_found', async () => {
    users.findByIdWithSecret = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({ userId: 'u1', currentPassword: 'pw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
    expect(users.delete).not.toHaveBeenCalled()
  })

  it('パスワード不一致は wrong_password で削除されない', async () => {
    passwords.verify = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ userId: 'u1', currentPassword: 'wrong' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('wrong_password')
    expect(users.delete).not.toHaveBeenCalled()
  })

  it('users.delete が false なら not_found', async () => {
    users.delete = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ userId: 'u1', currentPassword: 'pw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('not_found')
  })

  it('デモユーザーは demo_forbidden で拒否され delete は呼ばれない (issue #57)', async () => {
    const isDemoUser = vi.fn().mockResolvedValue(true)
    const demoInteractor = new DeleteAccountInteractor(users, passwords, isDemoUser)
    const result = await demoInteractor.execute({ userId: 'u1', currentPassword: 'pw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('demo_forbidden')
    expect(isDemoUser).toHaveBeenCalledWith('u1')
    expect(users.delete).not.toHaveBeenCalled()
  })
})
