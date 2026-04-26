import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  authHeaders,
  register,
  login,
  logout,
  fetchMe,
  changePassword,
  deleteAccount,
} from './auth'

const fetchMock = vi.fn()

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  name: 'テスト',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function ok(body: unknown) {
  return {
    ok: true,
    status: 200,
    json: async () => body,
  }
}

function ng(status: number, body: unknown) {
  return {
    ok: false,
    status,
    json: async () => body,
  }
}

beforeEach(() => {
  globalThis.fetch = fetchMock as unknown as typeof fetch
  fetchMock.mockReset()
  localStorage.clear()
})

afterEach(() => {
  localStorage.clear()
})

describe('authHeaders', () => {
  it('トークンが無ければ空オブジェクト', () => {
    expect(authHeaders()).toEqual({})
  })

  it('トークンがあれば Bearer ヘッダーを返す', () => {
    localStorage.setItem('token', 'tk1')
    expect(authHeaders()).toEqual({ Authorization: 'Bearer tk1' })
  })
})

describe('register', () => {
  it('成功時は user を返し、token を localStorage に保存する', async () => {
    fetchMock.mockResolvedValue(ok({ user: mockUser, token: 'tk-new' }))
    const result = await register('a@a', 'password1234', 'name', true)
    expect(result).toEqual(mockUser)
    expect(localStorage.getItem('token')).toBe('tk-new')
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/register',
      expect.objectContaining({ method: 'POST' }),
    )
    const body = JSON.parse(fetchMock.mock.calls[0][1].body)
    expect(body).toEqual({
      email: 'a@a',
      password: 'password1234',
      name: 'name',
      termsAgreed: true,
    })
  })

  it('失敗時は error メッセージを Error で投げる', async () => {
    fetchMock.mockResolvedValue(ng(409, { error: 'email already registered' }))
    await expect(register('a@a', 'pw', 'n', true)).rejects.toThrow('email already registered')
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('エラーレスポンスに error が無ければ既定メッセージ', async () => {
    fetchMock.mockResolvedValue(ng(500, {}))
    await expect(register('a@a', 'pw', 'n', true)).rejects.toThrow('Registration failed')
  })
})

describe('login', () => {
  it('成功時は user を返し token を保存する', async () => {
    fetchMock.mockResolvedValue(ok({ user: mockUser, token: 'tk' }))
    expect(await login('a@a', 'pw')).toEqual(mockUser)
    expect(localStorage.getItem('token')).toBe('tk')
  })

  it('失敗時はエラー', async () => {
    fetchMock.mockResolvedValue(ng(401, { error: '不正' }))
    await expect(login('a@a', 'pw')).rejects.toThrow('不正')
  })

  it('error が無ければ既定メッセージ', async () => {
    fetchMock.mockResolvedValue(ng(500, {}))
    await expect(login('a@a', 'pw')).rejects.toThrow('Login failed')
  })
})

describe('logout', () => {
  it('localStorage の token を削除する', () => {
    localStorage.setItem('token', 'tk')
    logout()
    expect(localStorage.getItem('token')).toBeNull()
  })
})

describe('fetchMe', () => {
  it('トークンが無ければ null を返し fetch を呼ばない', async () => {
    expect(await fetchMe()).toBeNull()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('成功時は user を返す', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ok(mockUser))
    expect(await fetchMe()).toEqual(mockUser)
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/auth/me',
      expect.objectContaining({ headers: { Authorization: 'Bearer tk' } }),
    )
  })

  it('401 等のとき token をクリアして null', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ng(401, { error: 'unauth' }))
    expect(await fetchMe()).toBeNull()
    expect(localStorage.getItem('token')).toBeNull()
  })
})

describe('changePassword', () => {
  it('トークンが無ければエラー', async () => {
    await expect(changePassword('a', 'b')).rejects.toThrow('Not authenticated')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('成功時は何も返さない', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ok({ message: 'password updated' }))
    await expect(changePassword('cur', 'newpassword')).resolves.toBeUndefined()
    const call = fetchMock.mock.calls[0]
    expect(call[0]).toBe('/api/auth/password')
    expect(call[1].method).toBe('PATCH')
  })

  it('失敗時はエラー', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ng(401, { error: 'wrong' }))
    await expect(changePassword('cur', 'new')).rejects.toThrow('wrong')
  })

  it('失敗時 error 無しは既定メッセージ', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ng(500, {}))
    await expect(changePassword('cur', 'new')).rejects.toThrow('Failed to change password')
  })
})

describe('deleteAccount', () => {
  it('トークンが無ければ何もせず終了', async () => {
    await deleteAccount()
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('成功時は token を削除', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ok({ message: 'deleted' }))
    await deleteAccount()
    expect(localStorage.getItem('token')).toBeNull()
  })

  it('失敗時はエラー（token は残る）', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ng(500, { error: 'oops' }))
    await expect(deleteAccount()).rejects.toThrow('oops')
    expect(localStorage.getItem('token')).toBe('tk')
  })

  it('失敗時 error 無しは既定メッセージ', async () => {
    localStorage.setItem('token', 'tk')
    fetchMock.mockResolvedValue(ng(500, {}))
    await expect(deleteAccount()).rejects.toThrow('Failed to delete account')
  })
})
