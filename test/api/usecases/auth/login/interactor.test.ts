import { describe, it, expect, vi, beforeEach } from 'vitest'
import { LoginInteractor } from '@api/usecases/auth/login/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'
import type { TokenService } from '@api/domain/services/TokenService.js'

const mockSecret = {
  id: 'u1',
  email: 'test@example.com',
  name: 'Test User',
  passwordHash: 'salt:hash',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

let users: UserRepository
let passwords: PasswordHashService
let tokens: TokenService
let interactor: LoginInteractor

beforeEach(() => {
  users = {
    findByEmail: vi.fn().mockResolvedValue(mockSecret),
    findById: vi.fn(),
    create: vi.fn(),
    updatePassword: vi.fn(),
    delete: vi.fn(),
  }
  passwords = {
    hash: vi.fn().mockResolvedValue('dummy-salt:dummy-hash'),
    verify: vi.fn().mockResolvedValue(true),
  }
  tokens = {
    issue: vi.fn().mockResolvedValue('test-token'),
    issueLongLived: vi.fn(),
    verify: vi.fn(),
  }
  interactor = new LoginInteractor(users, passwords, tokens)
})

describe('LoginInteractor', () => {
  beforeEach(() => {
    vi.spyOn(console, 'info').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('成功時は user/token を返し、passwordHash は除外する', async () => {
    const result = await interactor.execute({ email: 'test@example.com', password: 'pw' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.user.email).toBe('test@example.com')
      expect((result.user as unknown as Record<string, unknown>).passwordHash).toBeUndefined()
      expect(result.token).toBe('test-token')
    }
  })

  it('email/password 欠落は invalid_input', async () => {
    const result = await interactor.execute({ email: '', password: 'pw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
  })

  it('ユーザーが見つからない場合も verify を呼んで時間差を消し invalid_credentials', async () => {
    users.findByEmail = vi.fn().mockResolvedValue(null)
    const result = await interactor.execute({ email: 'x@y.com', password: 'pw' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_credentials')
    // タイミングオラクル対策: ユーザー不在でも verify を実行している
    expect(passwords.verify).toHaveBeenCalled()
  })

  it('パスワード不一致は invalid_credentials', async () => {
    passwords.verify = vi.fn().mockResolvedValue(false)
    const result = await interactor.execute({ email: 'x@y.com', password: 'wrong' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_credentials')
  })

  it('失敗時は emailFp と userExists を warn ログ出力する（生 email は出さない）', async () => {
    const warn = vi.mocked(console.warn)
    passwords.verify = vi.fn().mockResolvedValue(false)
    await interactor.execute({ email: 'logged@example.com', password: 'wrong' })
    const call = warn.mock.calls.find((c) => c[0] === 'auth.login.failed')
    expect(call).toBeDefined()
    const meta = call?.[1] as { emailFp: string; userExists: boolean }
    expect(meta.emailFp).toMatch(/^[0-9a-f]{16}$/)
    expect(meta.userExists).toBe(true)
    expect(JSON.stringify(call)).not.toContain('logged@example.com')
  })

  it('成功時は userId のみ info ログ出力（email は含めない）', async () => {
    const info = vi.mocked(console.info)
    await interactor.execute({ email: 'test@example.com', password: 'pw' })
    const call = info.mock.calls.find((c) => c[0] === 'auth.login.success')
    expect(call).toBeDefined()
    expect(JSON.stringify(call)).not.toContain('test@example.com')
  })
})
