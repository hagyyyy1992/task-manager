/**
 * パスワードポリシー (issue #61, NIST SP 800-63B § 5.1.1.2 準拠)
 *
 * - 最小 12 文字 (NIST 推奨は >= 8 だが、本アプリは 12 を採用)
 * - 最大 256 文字
 * - 英字 + 数字を必ず含む (記号は推奨だが必須にしない)
 * - メールアドレスのローカル部 (@ より前) を含むものを拒否
 * - 既知漏洩 PW (HIBP) チェック
 *
 * register / change-password の双方から共通利用する。
 */
import type { BreachedPasswordChecker } from '../../../domain/services/BreachedPasswordChecker.js'

export const PASSWORD_MIN = 12
export const PASSWORD_MAX = 256

export type PasswordPolicyError = { ok: false; message: string } | { ok: true }

export interface ValidatePasswordOptions {
  password: string
  email?: string | null
  breachedChecker?: BreachedPasswordChecker
}

/**
 * 静的ルール (長さ・文字種・メール部分一致) のみを検証。
 * HIBP チェックは別途 `checkBreachedPassword` で実施 (テストの分離容易性のため)。
 */
export function validatePasswordStatic(opts: ValidatePasswordOptions): PasswordPolicyError {
  const { password, email } = opts
  if (password.length < PASSWORD_MIN) {
    return { ok: false, message: `password must be at least ${PASSWORD_MIN} characters` }
  }
  if (password.length > PASSWORD_MAX) {
    return { ok: false, message: `password must be at most ${PASSWORD_MAX} characters` }
  }
  if (!/[a-zA-Z]/.test(password) || !/[0-9]/.test(password)) {
    return { ok: false, message: 'password must contain both letters and digits' }
  }
  if (email) {
    const localPart = email.split('@')[0]?.trim().toLowerCase()
    if (localPart && localPart.length >= 3 && password.toLowerCase().includes(localPart)) {
      return { ok: false, message: 'password must not contain your email local part' }
    }
  }
  return { ok: true }
}

/**
 * HIBP 漏洩チェック。ネットワーク失敗時は fail-open (拒否しない) で例外も投げない。
 * - fail-open 設計理由: HIBP 障害でアプリ全体のユーザー登録/PW 変更が止まる方がリスク大。
 *   静的ルールで弱 PW は既に弾けているため許容範囲。
 */
export async function checkBreachedPassword(
  password: string,
  checker: BreachedPasswordChecker | undefined,
): Promise<PasswordPolicyError> {
  if (!checker) return { ok: true }
  try {
    const breached = await checker.isBreached(password)
    if (breached) {
      return {
        ok: false,
        message: 'this password has appeared in a known data breach; please choose another',
      }
    }
    return { ok: true }
  } catch {
    // fail-open: ログは checker 実装側で出す
    return { ok: true }
  }
}
