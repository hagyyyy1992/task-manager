import { describe, it, expect, vi, beforeEach } from 'vitest'
import { RegisterInteractor } from '@api/usecases/auth/register/interactor.js'
import type { UserRepository } from '@api/domain/repositories/UserRepository.js'
import type { CategoryRepository } from '@api/domain/repositories/CategoryRepository.js'
import type { PasswordHashService } from '@api/domain/services/PasswordHashService.js'
import type { TokenService } from '@api/domain/services/TokenService.js'

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
let interactor: RegisterInteractor

const validInput = {
  email: 'test@example.com',
  password: 'password1234',
  name: 'Test User',
  termsAgreed: true,
}

beforeEach(() => {
  users = {
    findByEmail: vi.fn().mockResolvedValue(null),
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
  interactor = new RegisterInteractor(users, categories, passwords, tokens, () => isAllowed())
})

describe('RegisterInteractor', () => {
  it('成功時は user/token を返し、デフォルトカテゴリも seed する', async () => {
    const result = await interactor.execute(validInput)
    expect(result).toEqual({ ok: true, user: mockUser, token: 'test-token' })
    expect(categories.seedDefaults).toHaveBeenCalledWith('u1')
    expect(passwords.hash).toHaveBeenCalledWith('password1234')
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

  it('短いパスワードは invalid_input', async () => {
    const result = await interactor.execute({ ...validInput, password: 'short' })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.message).toContain('8 characters')
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
})
