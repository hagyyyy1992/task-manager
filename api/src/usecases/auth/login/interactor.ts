import { createHash } from 'crypto'
import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { TokenService } from '../../../domain/services/TokenService.js'
import type { LoginInput, LoginUseCase } from './input-port.js'
import type { LoginOutput } from './output-port.js'

const INVALID = 'メールアドレスまたはパスワードが正しくありません'

// 認証イベントログ用に email を SHA-256 で伏字化する
// (元 email を直接ログに残すと PII になるため)
function emailFingerprint(email: string): string {
  return createHash('sha256').update(email.toLowerCase()).digest('hex').slice(0, 16)
}

// ユーザー不在時もダミーハッシュに対して verify を実行することで scrypt の
// 計算時間を消費し、応答時間差から user enumeration されないようにする。
// 起動時に一度だけ計算してキャッシュ。
let dummyHashPromise: Promise<string> | null = null
function getDummyHash(passwords: PasswordHashService): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = passwords.hash('timing-attack-mitigation-placeholder')
  }
  return dummyHashPromise
}

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
    const hashToCheck = userRow?.passwordHash ?? (await getDummyHash(this.passwords))
    const valid = await this.passwords.verify(input.password, hashToCheck)
    if (!userRow || !valid) {
      console.warn('auth.login.failed', {
        emailFp: emailFingerprint(input.email),
        userExists: !!userRow,
      })
      return { ok: false, reason: 'invalid_credentials', message: INVALID }
    }

    const token = await this.tokens.issue(userRow.id)
    const { passwordHash: _ph, ...user } = userRow
    void _ph
    console.info('auth.login.success', { userId: userRow.id })
    return { ok: true, user, token }
  }
}
