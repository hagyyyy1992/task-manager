import { scrypt, randomBytes, timingSafeEqual } from 'crypto'
import type { PasswordHashService } from '../../domain/services/PasswordHashService.js'

export class ScryptPasswordHashService implements PasswordHashService {
  hash(password: string): Promise<string> {
    const salt = randomBytes(16).toString('hex')
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (err, derived) => {
        if (err) reject(err)
        else resolve(`${salt}:${derived.toString('hex')}`)
      })
    })
  }

  verify(password: string, hash: string): Promise<boolean> {
    const [salt, key] = hash.split(':')
    return new Promise((resolve, reject) => {
      scrypt(password, salt, 64, (err, derived) => {
        if (err) reject(err)
        else resolve(timingSafeEqual(Buffer.from(key, 'hex'), derived))
      })
    })
  }
}
