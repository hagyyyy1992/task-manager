import { randomUUID } from 'crypto'
import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { CategoryRepository } from '../../../domain/repositories/CategoryRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { RegisterInput, RegisterUseCase } from './input-port.js'
import type { RegisterOutput } from './output-port.js'

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
    if (!input.email || !input.password || !input.name) {
      return { ok: false, reason: 'invalid_input', message: 'email, password, name are required' }
    }
    if (input.password.length < 8) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'password must be at least 8 characters',
      }
    }
    if (!input.termsAgreed) {
      return { ok: false, reason: 'terms_required', message: '利用規約への同意が必要です' }
    }

    const existing = await this.users.findByEmail(input.email)
    if (existing) {
      return { ok: false, reason: 'duplicate', message: 'email already registered' }
    }

    const id = randomUUID()
    const passwordHash = await this.passwords.hash(input.password)
    const termsAgreedAt = new Date().toISOString()
    const user = await this.users.create(id, input.email, input.name, passwordHash, termsAgreedAt)
    await this.categories.seedDefaults(user.id)
    const token = await this.tokens.issue(user.id)

    return { ok: true, user, token }
  }
}
