import { randomUUID } from 'crypto'
import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { BreachedPasswordChecker } from '../../../domain/services/BreachedPasswordChecker.js'
import {
  PASSWORD_MAX,
  validatePasswordStatic,
  checkBreachedPassword,
} from '../shared/password-policy.js'
import type { RegisterInput, RegisterUseCase } from './input-port.js'
import type { RegisterOutput } from './output-port.js'

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const EMAIL_MAX = 254 // RFC 5321
const NAME_MAX = 100

export class RegisterInteractor implements RegisterUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly categories: CategoryRepository,
    private readonly passwords: PasswordHashService,
    private readonly tokens: TokenService,
    private readonly isRegistrationAllowed: () => boolean,
    private readonly tokenRepo: TokenRepository,
    private readonly breachedChecker?: BreachedPasswordChecker,
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
    if (password.length > PASSWORD_MAX) {
      // 長さ上限のみ static チェック前に判定 (static でも返すが、メッセージを既存と揃える)
      return {
        ok: false,
        reason: 'invalid_input',
        message: `password must be at most ${PASSWORD_MAX} characters`,
      }
    }
    const staticCheck = validatePasswordStatic({ password, email })
    if (!staticCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: staticCheck.message }
    }
    if (!input.termsAgreed) {
      return { ok: false, reason: 'terms_required', message: '利用規約への同意が必要です' }
    }

    const breachedCheck = await checkBreachedPassword(password, this.breachedChecker)
    if (!breachedCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: breachedCheck.message }
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
    const jti = randomUUID()
    const token = await this.tokens.issue(user.id, jti)
    await this.tokenRepo.create({
      id: randomUUID(),
      userId: user.id,
      scope: 'session',
      jti,
      label: '',
    })

    return { ok: true, user, token }
  }
}
