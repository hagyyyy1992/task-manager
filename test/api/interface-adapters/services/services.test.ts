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

  it('壊れた hash 形式 (区切り無し) は throw せず false を返す', async () => {
    expect(await svc.verify('hunter2', 'broken-hash-no-colon')).toBe(false)
  })

  it('壊れた hash 形式 (key 部空文字) は throw せず false を返す', async () => {
    expect(await svc.verify('hunter2', 'somesalt:')).toBe(false)
  })

  it('壊れた hash 形式 (key 長さ違い) は throw せず false を返す', async () => {
    expect(await svc.verify('hunter2', 'somesalt:0123456789abcdef')).toBe(false)
  })
})

describe('JoseTokenService', () => {
  const svc = new JoseTokenService('test-secret-test-secret')

  it('JWT_SECRET 未指定はコンストラクタで例外', () => {
    expect(() => new JoseTokenService('')).toThrow()
  })

  it('issue → verify で userId / scope=session / iat (現在時刻 ±1s 以内) を復元', async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await svc.issue('user-1')
    const verified = await svc.verify(token)
    expect(verified?.userId).toBe('user-1')
    expect(verified?.scope).toBe('session')
    expect(verified?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(verified?.issuedAt).toBeLessThanOrEqual(before + 1)
  })

  it('issueLongLived は scope=mcp / iat / 渡した jti を返す', async () => {
    const before = Math.floor(Date.now() / 1000)
    const token = await svc.issueLongLived('user-1', 'jti-xyz')
    const verified = await svc.verify(token)
    expect(verified?.userId).toBe('user-1')
    expect(verified?.scope).toBe('mcp')
    expect(verified?.issuedAt).toBeGreaterThanOrEqual(before)
    expect(verified?.issuedAt).toBeLessThanOrEqual(before + 1)
    expect(verified?.jti).toBe('jti-xyz')
  })

  // issue #37 以前に発行された旧 mcp トークン (jti claim 無し) との互換性確認。
  // verify は jti=null を返し、middleware 側で 401 拒否される (再発行を強制する設計)。
  it('jti claim 無しの mcp トークンは verify で jti=null', async () => {
    // setJti を呼ばないだけの旧実装と同等の token を作る (svc と同じシークレットで署名)
    const { SignJWT } = await import('jose')
    const secret = new TextEncoder().encode('test-secret-test-secret')
    const legacy = await new SignJWT({ sub: 'user-1', scope: 'mcp' })
      .setProtectedHeader({ alg: 'HS256' })
      .setIssuedAt()
      .setExpirationTime('365d')
      .sign(secret)
    const verified = await svc.verify(legacy)
    expect(verified?.jti).toBeNull()
  })

  it('session トークンは jti=null', async () => {
    const token = await svc.issue('user-1')
    const verified = await svc.verify(token)
    expect(verified?.jti).toBeNull()
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
