import { randomUUID } from 'crypto'
import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { RegisterInput, RegisterUseCase } from './input-port.js'
import type { RegisterOutput } from './output-port.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 254 // RFC 5321
const NAME_MAX = 100
const PASSWORD_MAX = 256

export class RegisterInteractor implements RegisterUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository,
    private readonly passwords: PasswordHashService,
    private readonly tokens: TokenService,
    private readonly isRegistrationAllowed: () => boolean,
  ) {}

  async execute(input: RegisterInput): Promise<RegisterOutput> {
    if (!this.isRegistrationAllowed()) {
      return { ok: false, reason: 'disabled', message: '新規登録は現在受け付けていません' }
    }
    const email = (input.email ?? '').trim().toLowerCase()
    const name = (input.name ?? '').trim()
    const password = input.password ?? ''
    if (!email || !password || !name) {
      return { ok: false, reason: 'invalid_input', message: 'email, password, name are required' }
    }
    if (email.length > EMAIL_MAX || !EMAIL_RE.test(email) || /[\r\n]/.test(email)) {
      return { ok: false, reason: 'invalid_input', message: 'email is invalid' }
    }
    if (name.length > NAME_MAX) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: `name must be at most ${NAME_MAX} characters`,
      }
    }
    if (password.length < 8) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'password must be at least 8 characters',
      }
    }
    if (password.length > PASSWORD_MAX) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: `password must be at most ${PASSWORD_MAX} characters`,
      }
    }
    if (!input.termsAgreed) {
      return { ok: false, reason: 'terms_required', message: '利用規約への同意が必要です' }
    }

    const existing = await this.users.findByEmail(email)
    if (existing) {
      return { ok: false, reason: 'duplicate', message: 'email already registered' }
    }

    const id = randomUUID()
    const passwordHash = await this.passwords.hash(password)
    const termsAgreedAt = new Date().toISOString()
    const user = await this.users.create(id, email, name, passwordHash, termsAgreedAt)
    await this.categories.seedDefaults(user.id)
    const token = await this.tokens.issue(user.id)

    return { ok: true, user, token }
  }
}
