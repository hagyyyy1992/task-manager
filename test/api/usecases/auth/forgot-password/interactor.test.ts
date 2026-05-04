import { describe, it, expect, vi, beforeEach } from 'vitest'
import { ForgotPasswordInteractor } from '@api/usecases/auth/forgot-password/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { TokenRepository } from '@api/domain/repositories/TokenRepository.js'
import type { Mailer } from '@api/domain/services/Mailer.js'

const existingUser = {
  id: 'u1',
  email: 'a@b.com',
  name: 'X',
  passwordHash: 'salt:hash',
  passwordChangedAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

let users: UserRepository
let tokenRepo: TokenRepository
let mailer: Mailer
let interactor: ForgotPasswordInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn().mockResolvedValue(existingUser),
    findById: vi.fn(),
    findByIdWithSecret: vi.fn(),
    create: vi.fn(),
    updatePassword: vi.fn(),
    delete: vi.fn(),
  }
  tokenRepo = {
    create: vi.fn().mockResolvedValue(undefined),
    findByJti: vi.fn(),
    listActiveByUser: vi.fn(),
    revoke: vi.fn(),
    revokeByJti: vi.fn(),
    touchLastUsed: vi.fn(),
  }
  mailer = { sendPasswordReset: vi.fn().mockResolvedValue(undefined) }
  interactor = new ForgotPasswordInteractor(users, tokenRepo, mailer, 'https://app.example.com')
})

describe('ForgotPasswordInteractor', () => {
  it('実在ユーザーに対して reset Token を作り、リセットリンク mail を送る', async () => {
    const result = await interactor.execute({ email: 'a@b.com' })
    expect(result.ok).toBe(true)
    expect(tokenRepo.create).toHaveBeenCalledTimes(1)
    const arg = vi.mocked(tokenRepo.create).mock.calls[0][0]
    expect(arg.userId).toBe('u1')
    expect(arg.scope).toBe('reset')
    expect(arg.label).toBe('')
    expect(arg.jti.length).toBeGreaterThanOrEqual(32)
    expect(mailer.sendPasswordReset).toHaveBeenCalledWith(
      'a@b.com',
      expect.stringContaining('https://app.example.com/reset-password?token='),
    )
  })

  it('email を trim + lowercase してから lookup する (login と同じ正規化)', async () => {
    await interactor.execute({ email: '  A@B.COM  ' })
    expect(users.findByEmail).toHaveBeenCalledWith('a@b.com')
  })

  it('email 列挙対策: 不在 email でも ok:true を返し、Token / mail は生成しない', async () => {
    users.findByEmail = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({ email: 'nope@b.com' })
    expect(result.ok).toBe(true)
    expect(tokenRepo.create).not.toHaveBeenCalled()
    expect(mailer.sendPasswordReset).not.toHaveBeenCalled()
  })

  it('email 形式不正は invalid_input で 400', async () => {
    const result = await interactor.execute({ email: 'not-an-email' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
    expect(users.findByEmail).not.toHaveBeenCalled()
  })

  it('Mailer 送信失敗でも応答は ok:true (enumeration 対策)', async () => {
    mailer.sendPasswordReset = vi.fn().mockRejectedValue(new Error('mail down'))
    const errSpy = vi.spyOn(console, 'error').mockImplementation(() => {})
    const result = await interactor.execute({ email: 'a@b.com' })
    expect(result.ok).toBe(true)
    errSpy.mockRestore()
  })

  it('生成された jti は呼び出しごとに異なる (再利用させない)', async () => {
    await interactor.execute({ email: 'a@b.com' })
    await interactor.execute({ email: 'a@b.com' })
    const j1 = vi.mocked(tokenRepo.create).mock.calls[0][0].jti
    const j2 = vi.mocked(tokenRepo.create).mock.calls[1][0].jti
    expect(j1).not.toBe(j2)
  })
})
