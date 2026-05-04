import { randomBytes, randomUUID } from 'crypto'
import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { Mailer } from '../../../domain/services/Mailer.js'
import type { ForgotPasswordInput, ForgotPasswordUseCase } from './input-port.js'
import type { ForgotPasswordOutput } from './output-port.js'

// reset token は URL に載せる secret 値。base64url(32 byte) = 256 bit エントロピー。
// 32 byte = 43 文字の base64url で URL-safe。
function generateResetJti(): string {
  return randomBytes(32).toString('base64url')
}

// 簡易 email 形式チェック。RFC 完全準拠は不要 (本格チェックは送信側に任せる)。
// 列挙対策上ここで弾くのは「明らかに email でない値」のみで、正常な email 文字列は素通りさせる。
function isValidEmailShape(email: string): boolean {
  if (!email || email.length > 254) return false
  // 1 個の @、両側に文字、ドメイン側に . を要求する最低限の構造チェック
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
}

export class ForgotPasswordInteractor implements ForgotPasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly tokenRepo: TokenRepository,
    private readonly mailer: Mailer,
    // reset link を組み立てる base URL (例: "https://app.example.com")。末尾スラッシュ不要。
    private readonly resetUrlBase: string,
  ) {}

  async execute(input: ForgotPasswordInput): Promise<ForgotPasswordOutput> {
    // register/login と同じ正規化で case 違いをヒットさせる
    const email = (input.email ?? '').trim().toLowerCase()
    if (!isValidEmailShape(email)) {
      return { ok: false, reason: 'invalid_input', message: 'invalid email format' }
    }

    // email 列挙対策: 実在チェック結果に関わらず常に ok:true を返す (issue #66)。
    // 実在ユーザーには token を発行・mailer 経由でリンク送信。
    // 不在 email にはトークンを作らない (= DB に痕跡を残さない) が、
    // 応答時間差から enumeration されないよう、外側からは同じ ok:true に見せる。
    const user = await this.users.findByEmail(email)
    if (user) {
      const id = randomUUID()
      const jti = generateResetJti()
      try {
        await this.tokenRepo.create({
          id,
          userId: user.id,
          scope: 'reset',
          jti,
          // reset token は label を持たない (UI 一覧にも出さない)
          label: '',
        })
        const link = `${this.resetUrlBase}/reset-password?token=${encodeURIComponent(jti)}`
        await this.mailer.sendPasswordReset(email, link)
      } catch (err) {
        // mailer / DB 失敗もログに留める。応答は ok:true を維持して enumeration を防ぐ。
        console.error('auth.forgot_password.failed', {
          // email を直接ログに出すと PII になるため fingerprint 化したいところだが、
          // 本 PR では LogMailer 段階なので最低限のメタデータのみ。SES 統合時に整理する。
          err: err instanceof Error ? err.message : String(err),
        })
      }
    }

    return { ok: true }
  }
}
