// @vitest-environment node
// jose は jsdom 環境下だと globalThis.Uint8Array と Node の Uint8Array が
// instanceof 比較で食い違うため、この層は node 環境で実行する。
import { describe, it, expect } from 'vitest'
import { ScryptPasswordHashService } from '@api/interface-adapters/services/ScryptPasswordHashService.js'
import { JoseTokenService } from '@api/interface-adapters/services/JoseTokenService.js'

describe('ScryptPasswordHashService', () => {
  const svc = new ScryptPasswordHashService()
  it('hash → verify が一致する', async () => {
    const hash = await svc.hash('hunter2')
    expect(hash).toMatch(/^[0-9a-f]+:[0-9a-f]+$/)
    expect(await svc.verify('hunter2', hash)).toBe(true)
  })
  it('違うパスワードは false', async () => {
    const hash = await svc.hash('hunter2')
    expect(await svc.verify('wrong', hash)).toBe(false)
  })
})

describe('JoseTokenService', () => {
  const svc = new JoseTokenService('test-secret-test-secret')

  it('JWT_SECRET 未指定はコンストラクタで例外', () => {
    expect(() => new JoseTokenService('')).toThrow()
  })

  it('issue → verify で userId と scope=session を復元', async () => {
    const token = await svc.issue('user-1')
    expect(await svc.verify(token)).toEqual({ userId: 'user-1', scope: 'session' })
  })

  it('issueLongLived は scope=mcp を返す', async () => {
    const token = await svc.issueLongLived('user-1')
    expect(await svc.verify(token)).toEqual({ userId: 'user-1', scope: 'mcp' })
  })

  it('改竄/不正トークンは null', async () => {
    expect(await svc.verify('garbage')).toBeNull()
  })

  it('別シークレットで署名されたトークンは null', async () => {
    const other = new JoseTokenService('different-secret-xxxxxxxx')
    const token = await other.issue('user-1')
    expect(await svc.verify(token)).toBeNull()
  })

  it('alg=none などの非 HS256 トークンは null（アルゴリズム固定）', async () => {
    // jose の SignJWT は alg=none を許容しないので、手動で unsigned JWT を作る
    const header = Buffer.from(JSON.stringify({ alg: 'none', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ sub: 'user-1' })).toString('base64url')
    const noneToken = `${header}.${payload}.`
    expect(await svc.verify(noneToken)).toBeNull()
  })
})
