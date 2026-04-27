import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import type { PasswordHashService } from '../../domain/services/PasswordHashService.js'

const KEYLEN = 64

// NOTE: cost (N) は Node のデフォルト (N=16384) のまま。OWASP は最低 N=2^17 を
// 推奨しているが、引き上げると既存ユーザーの hash と互換性がなくなり全員ログイン
// 不能になる。アルゴリズム/パラメータをハッシュ文字列に埋め込んで新規/旧パラメータ
// を共存させる仕組み (e.g. `scrypt$N=2^15$salt$key`) を追加してから cost を上げる
// follow-up が必要。

export class ScryptPasswordHashService implements PasswordHashService {
  hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    return new Promise((resolve, reject) => {
      scrypt(password, salt, KEYLEN, (err, derived) => {
        if (err) reject(err)
        else resolve(`${salt}:${derived.toString('hex')}`)
      })
    })
  }

  verify(password: string, hash: string): Promise<boolean> {
    const [salt, key] = hash.split(':')
    // hash 形式が壊れている場合は throw せず false を返して onError 経由の
    // 詳細漏洩を防ぐ（timingSafeEqual は長さ不一致で RangeError を投げる）
    if (!salt || !key) return Promise.resolve(false)
    let stored: Buffer
    try {
      stored = Buffer.from(key, 'hex')
    } catch {
      return Promise.resolve(false)
    }
    if (stored.length !== KEYLEN) return Promise.resolve(false)
    return new Promise((resolve, reject) => {
      scrypt(password, salt, KEYLEN, (err, derived) => {
        if (err) reject(err)
        else resolve(timingSafeEqual(stored, derived))
      })
    })
  }
}
