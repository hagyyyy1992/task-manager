import { describe, it, expect } from 'vitest'
import { Id } from '@api/domain/value-objects/Id.js'
import { Email } from '@api/domain/value-objects/Email.js'
import { Password } from '@api/domain/value-objects/Password.js'

describe('Id', () => {
  it('生成と toString', () => {
    expect(Id.of('abc').toString()).toBe('abc')
  })
  it('空文字は例外', () => {
    expect(() => Id.of('')).toThrow()
  })
  it('equals は値で比較', () => {
    expect(Id.of('abc').equals(Id.of('abc'))).toBe(true)
    expect(Id.of('abc').equals(Id.of('xyz'))).toBe(false)
  })
})

describe('Email', () => {
  it('正常な email を作成（小文字化）', () => {
    expect(Email.of('Foo@Example.COM').toString()).toBe('foo@example.com')
  })
  it.each(['', 'no-at', '@no-local', 'no-domain@', 'a b@c.com'])('不正な email=%s', (v) => {
    expect(() => Email.of(v)).toThrow()
  })
  it('equals は正規化後の値で比較', () => {
    expect(Email.of('A@B.com').equals(Email.of('a@b.com'))).toBe(true)
  })
})

describe('Password', () => {
  it('8文字以上で OK', () => {
    expect(Password.of('12345678').toString()).toBe('12345678')
  })
  it('7文字以下は例外', () => {
    expect(() => Password.of('1234567')).toThrow('8 characters')
  })
  it('空文字は例外', () => {
    expect(() => Password.of('')).toThrow()
  })
})
