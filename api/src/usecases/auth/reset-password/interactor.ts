import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { BreachedPasswordChecker } from '../../../domain/services/BreachedPasswordChecker.js'
import type { ResetPasswordInput, ResetPasswordUseCase } from './input-port.js'
import type { ResetPasswordOutput } from './output-port.js'
import { validatePasswordStatic, checkBreachedPassword } from '../shared/password-policy.js'

// reset token の有効期限 (issue #66)。NIST SP 800-63B 推奨に合わせ 1h。
// Token テーブルに expiresAt 列がないため、createdAt + TTL で判定する。
export const RESET_TOKEN_TTL_MS = 60 * 60 * 1000

export class ResetPasswordInteractor implements ResetPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly passwords: PasswordHashService,
    private readonly breachedChecker?: BreachedPasswordChecker,
    private readonly now: () => Date = () => new Date(),
  ) {}

  async execute(input: ResetPasswordInput): Promise<ResetPasswordOutput> {
    const token = (input.token ?? '').trim()
    const newPassword = input.newPassword ?? ''
    if (!token || !newPassword) {
      return { ok: false, reason: 'invalid_input', message: 'token and newPassword are required' }
    }

    // email なし静的チェック (長さ・文字種) — token lookup 前に早期リジェクト
    const staticCheck = validatePasswordStatic({ password: newPassword })
    if (!staticCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: staticCheck.message }
    }

    const row = await this.tokenRepo.findByJti(token)
    // 詳細は外部に漏らさない (token enumeration 対策)。常に invalid_token を返す。
    if (!row || row.scope !== 'reset' || row.revokedAt !== null) {
      return { ok: false, reason: 'invalid_token', message: 'invalid or expired token' }
    }
    const createdAtMs = Date.parse(row.createdAt)
    if (Number.isNaN(createdAtMs) || this.now().getTime() - createdAtMs > RESET_TOKEN_TTL_MS) {
      return { ok: false, reason: 'invalid_token', message: 'invalid or expired token' }
    }

    // user を取得して email 含有チェックを実施
    const user = await this.users.findById(row.userId)
    if (!user) {
      return { ok: false, reason: 'invalid_token', message: 'invalid or expired token' }
    }
    const emailCheck = validatePasswordStatic({ password: newPassword, email: user.email })
    if (!emailCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: emailCheck.message }
    }

    // HIBP 漏洩チェック (fail-open)
    const breachCheck = await checkBreachedPassword(newPassword, this.breachedChecker)
    if (!breachCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: breachCheck.message }
    }

    // パスワード更新前に token を revoke する (single-use 化)。
    // updatePassword 後だと並行リクエストで二度同じ token が使える窓ができるため先に潰す。
    const revoked = await this.tokenRepo.revokeByJti(token)
    if (!revoked) {
      // 既に他のリクエストが revoke 済み (= race) なら再使用と見なして拒否
      return { ok: false, reason: 'invalid_token', message: 'invalid or expired token' }
    }

    const newHash = await this.passwords.hash(newPassword)
    // updatePassword は内部で passwordChangedAt を更新する → 既存 session JWT が全て失効 (issue #36)
    const updated = await this.users.updatePassword(row.userId, newHash)
    if (!updated) {
      // user が削除済み等のレアケース。token は既に revoke 済みで再発行不要。
      return { ok: false, reason: 'invalid_token', message: 'invalid or expired token' }
    }

    console.info('auth.reset_password.success', { userId: row.userId })
    return { ok: true }
  }
}
