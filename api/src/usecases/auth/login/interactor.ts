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
// 起動時に一度だけ計算してキャッシュ。reject 時はキャッシュを破棄して
// 次回再試行できるようにする (rejected promise を握り続けると以後の login が永久に失敗する)
let dummyHashPromise: Promise<string> | null = null
function getDummyHash(passwords: PasswordHashService): Promise<string> {
  if (!dummyHashPromise) {
    dummyHashPromise = passwords.hash('timing-attack-mitigation-placeholder').catch((e) => {
      dummyHashPromise = null
      throw e
    })
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
    // register 側で email を trim().toLowerCase() して保存しているため、
    // login でも同じ正規化をしないと case 違いでヒットせず enumeration の余地ができる
    const email = (input.email ?? '').trim().toLowerCase()
    if (!email || !input.password) {
      return { ok: false, reason: 'invalid_input', message: 'email and password are required' }
    }

    const userRow = await this.users.findByEmail(email)
    const hashToCheck = userRow?.passwordHash ?? (await getDummyHash(this.passwords))
    const valid = await this.passwords.verify(input.password, hashToCheck)
    if (!userRow || !valid) {
      console.warn('auth.login.failed', {
        emailFp: emailFingerprint(email),
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
