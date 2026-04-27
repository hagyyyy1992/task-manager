import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { LoginInput, LoginUseCase } from './input-port.js'
import type { LoginOutput } from './output-port.js'

const INVALID = 'メールアドレスまたはパスワードが正しくありません'

export class LoginInteractor implements LoginUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHashService,
    private readonly tokens: TokenService,
  ) {}

  async execute(input: LoginInput): Promise<LoginOutput> {
    if (!input.email || !input.password) {
      return { ok: false, reason: 'invalid_input', message: 'email and password are required' }
    }

    const userRow = await this.users.findByEmail(input.email)
    if (!userRow) return { ok: false, reason: 'invalid_credentials', message: INVALID }

    const valid = await this.passwords.verify(input.password, userRow.passwordHash)
    if (!valid) return { ok: false, reason: 'invalid_credentials', message: INVALID }

    const token = await this.tokens.issue(userRow.id)
    const { passwordHash: _ph, ...user } = userRow
    void _ph
    return { ok: true, user, token }
  }
}
