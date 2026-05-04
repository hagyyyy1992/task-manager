import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterInteractor } from '@api/usecases/auth/register/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { CategoryRepository } from '@api/domain/repositories/CategoryRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'
import type { TokenService } from '@api/domain/services/TokenService.js'
import type { BreachedPasswordChecker } from '@api/domain/services/BreachedPasswordChecker.js'

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  name: 'Test User',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

let users: UserRepository
let categories: CategoryRepository
let passwords: PasswordHashService
let tokens: TokenService
let isAllowed: () => boolean
let breachedChecker: BreachedPasswordChecker
let interactor: RegisterInteractor

const validInput = {
  email: 'test@example.com',
  password: 'StrongPass123!',
  name: 'Test User',
  termsAgreed: true,
}

beforeEach(() => {
  users = {
    findByEmail: vi.fn().mockResolvedValue(null),
    findByIdWithSecret: vi.fn(),
    findById: vi.fn(),
    create: vi.fn().mockResolvedValue(mockUser),
    updatePassword: vi.fn(),
    delete: vi.fn(),
  }
  categories = {
    listWithCounts: vi.fn(),
    list: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
    reorder: vi.fn(),
    seedDefaults: vi.fn().mockResolvedValue(undefined),
  }
  passwords = {
    hash: vi.fn().mockResolvedValue('hashed'),
    verify: vi.fn(),
  }
  tokens = {
    issue: vi.fn().mockResolvedValue('test-token'),
    issueLongLived: vi.fn(),
    verify: vi.fn(),
  }
  isAllowed = () => true
  breachedChecker = { isBreached: vi.fn().mockResolvedValue(false) }
  interactor = new RegisterInteractor(
    users,
    categories,
    passwords,
    tokens,
    () => isAllowed(),
    breachedChecker,
  )
})

describe('RegisterInteractor', () => {
  it('成功時は user/token を返し、デフォルトカテゴリも seed する', async () => {
    const result = await interactor.execute(validInput)
    expect(result).toEqual({ ok: true, user: mockUser, token: 'test-token' })
    expect(categories.seedDefaults).toHaveBeenCalledWith('u1')
    expect(passwords.hash).toHaveBeenCalledWith('StrongPass123!')
    expect(breachedChecker.isBreached).toHaveBeenCalledWith('StrongPass123!')
  })

  it('登録無効化中は disabled', async () => {
    isAllowed = () => false
    const result = await interactor.execute(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('disabled')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('必須項目欠落は invalid_input', async () => {
    const result = await interactor.execute({ ...validInput, email: '' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('invalid_input')
  })

  it('短いパスワード(12文字未満)は invalid_input (issue #61)', async () => {
    const result = await interactor.execute({ ...validInput, password: 'Short1!' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('12 characters')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('英字のみ(数字なし)パスワードは invalid_input (issue #61)', async () => {
    const result = await interactor.execute({ ...validInput, password: 'OnlyLettersHere' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('letters and digits')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('数字のみ(英字なし)パスワードは invalid_input (issue #61)', async () => {
    const result = await interactor.execute({ ...validInput, password: '123456789012' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('letters and digits')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('メールローカル部を含むパスワードは invalid_input (issue #61)', async () => {
    const result = await interactor.execute({
      ...validInput,
      email: 'alice@example.com',
      password: 'aliceStrong123',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('email local part')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('HIBP で漏洩している PW は invalid_input (issue #61)', async () => {
    breachedChecker.isBreached = vi.fn().mockResolvedValue(true)
    const result = await interactor.execute(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('data breach')
    expect(users.create).not.toHaveBeenCalled()
  })

  it('HIBP が例外を投げても fail-open で登録は通る (issue #61)', async () => {
    breachedChecker.isBreached = vi.fn().mockRejectedValue(new Error('network down'))
    const result = await interactor.execute(validInput)
    expect(result.ok).toBe(true)
    expect(users.create).toHaveBeenCalled()
  })

  it('breachedChecker 未注入でも登録は通る (DI 欠落の互換)', async () => {
    const interactorNoChecker = new RegisterInteractor(
      users,
      categories,
      passwords,
      tokens,
      () => true,
    )
    const result = await interactorNoChecker.execute(validInput)
    expect(result.ok).toBe(true)
  })

  it('規約未同意は terms_required', async () => {
    const result = await interactor.execute({ ...validInput, termsAgreed: false })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('terms_required')
  })

  it('email 重複は duplicate', async () => {
    users.findByEmail = vi.fn().mockResolvedValue({ ...mockUser, passwordHash: 'x' })
    const result = await interactor.execute(validInput)
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.reason).toBe('duplicate')
    expect(categories.seedDefaults).not.toHaveBeenCalled()
  })

  it.each([
    'plain-string',
    'a@b',
    'no-at-symbol',
    'with space@example.com',
    'newline@example.com\nX-Header: x',
    'a'.repeat(300) + '@example.com',
  ])('不正な email=%s は invalid_input', async (email) => {
    const result = await interactor.execute({ ...validInput, email })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toMatch(/email/)
    expect(users.create).not.toHaveBeenCalled()
  })

  it('過剰に長い name は invalid_input', async () => {
    const result = await interactor.execute({ ...validInput, name: 'x'.repeat(101) })
    expect(result.ok).toBe(false)
    expect(users.create).not.toHaveBeenCalled()
  })

  it('過剰に長い password は invalid_input', async () => {
    const result = await interactor.execute({ ...validInput, password: 'x'.repeat(257) })
    expect(result.ok).toBe(false)
    expect(users.create).not.toHaveBeenCalled()
  })

  it('email は trim/lower-case してから保存', async () => {
    await interactor.execute({ ...validInput, email: '  Test@Example.COM  ' })
    expect(users.create).toHaveBeenCalledWith(
      expect.any(String),
      'test@example.com',
      'Test User',
      expect.any(String),
      expect.any(String),
    )
  })
})
