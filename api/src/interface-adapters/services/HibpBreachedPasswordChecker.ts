import { createHash } from 'crypto'
import type { BreachedPasswordChecker } from '../../domain/services/BreachedPasswordChecker.js'

/**
 * HIBP (Have I Been Pwned) Pwned Passwords k-Anonymity API 実装 (issue #61)
 *
 * - 平文 PW やフルハッシュを送信しない: SHA-1 の先頭 5 文字 (prefix) のみ送信
 * - レスポンス: prefix にマッチする suffix(35 文字) と出現回数の一覧
 * - クライアント側で suffix 一致を検査することで、サーバには真のハッシュが伝わらない
 * - 認証不要、レート制限緩い (使用条件: User-Agent 必須)
 *
 * fail-open: ネットワーク失敗・タイムアウト時は false (漏洩なし) を返す。
 *            アプリ全停止リスクを避ける。warn ログのみ。
 */
export class HibpBreachedPasswordChecker implements BreachedPasswordChecker {
  static readonly DEFAULT_ENDPOINT = 'https://api.pwnedpasswords.com/range/'
  static readonly DEFAULT_TIMEOUT_MS = 2000
  static readonly USER_AGENT = 'task-app/1.0 (+https://github.com/hagyyyy1992/task-manager)'

  constructor(
    private readonly endpoint: string = HibpBreachedPasswordChecker.DEFAULT_ENDPOINT,
    private readonly timeoutMs: number = HibpBreachedPasswordChecker.DEFAULT_TIMEOUT_MS,
    private readonly fetchImpl: typeof fetch = fetch,
    private readonly logger: Pick<Console, 'warn'> = console,
  ) {}

  async isBreached(password: string): Promise<boolean> {
    const sha1 = createHash('sha1').update(password, 'utf8').digest('hex').toUpperCase()
    const prefix = sha1.slice(0, 5)
    const suffix = sha1.slice(5)

    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), this.timeoutMs)
    try {
      const res = await this.fetchImpl(`${this.endpoint}${prefix}`, {
        method: 'GET',
        headers: {
          'User-Agent': HibpBreachedPasswordChecker.USER_AGENT,
          'Add-Padding': 'true', // HIBP の長さ撹乱パディング
        },
        signal: controller.signal,
      })
      if (!res.ok) {
        this.logger.warn(JSON.stringify({ event: 'hibp_failopen', reason: 'http_error', status: res.status }))
        return false
      }
      const text = await res.text()
      // 各行: "<SUFFIX>:<count>" (count=0 はパディング)
      for (const line of text.split('\n')) {
        const idx = line.indexOf(':')
        if (idx < 0) continue
        const lineSuffix = line.slice(0, idx).trim().toUpperCase()
        const lineCount = parseInt(line.slice(idx + 1), 10) || 0
        if (lineSuffix === suffix && lineCount > 0) {
          return true
        }
      }
      return false
    } catch (err) {
      this.logger.warn(
        JSON.stringify({ event: 'hibp_failopen', reason: 'fetch_error', error: (err as Error).message }),
      )
      return false
    } finally {
      clearTimeout(timer)
    }
  }
}
