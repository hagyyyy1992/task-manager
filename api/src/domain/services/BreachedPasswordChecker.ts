/**
 * 既知漏洩パスワードチェッカー (issue #61)
 *
 * NIST SP 800-63B § 5.1.1.2 では、登録/変更時のパスワードを
 * 既知の漏洩リストと照合し、含まれていれば拒否することを推奨している。
 *
 * 実装側は HIBP (Have I Been Pwned) Pwned Passwords k-Anonymity API などを
 * 用い、平文 PW やフルハッシュを外部送信しないこと (SHA-1 prefix 5 文字のみ送信が原則)。
 *
 * ネットワーク失敗時の挙動 (fail-open / fail-closed) は実装側に委ねる。
 * 既定実装 (HibpBreachedPasswordChecker) はアプリ全停止を避けるため fail-open。
 */
export interface BreachedPasswordChecker {
  isBreached(password: string): Promise<boolean>
}
