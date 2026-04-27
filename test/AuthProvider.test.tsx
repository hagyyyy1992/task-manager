import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, act, cleanup } from '@testing-library/react'
import { AuthProvider } from '@/AuthProvider'
import { useAuth } from '@/useAuth'

const mockUser = {
  id: 'u1',
  email: 'test@example.com',
  name: 'テスト',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

vi.mock('@/auth', async () => {
  const actual = await vi.importActual<typeof import('@/auth')>('@/auth')
  return {
    ...actual,
    fetchMe: vi.fn(),
    login: vi.fn(),
    register: vi.fn(),
    logout: vi.fn(),
    deleteAccount: vi.fn(),
  }
})

import * as authModule from '@/auth'

function Probe() {
  const { user, loading, login, register, logout, deleteAccount } = useAuth()
  return (
    <div>
      <p data-testid="loading">{loading ? 'loading' : 'ready'}</p>
      <p data-testid="user">{user ? user.email : 'none'}</p>
      <button onClick={() => login('a@a', 'pw')}>do-login</button>
      <button onClick={() => register('a@a', 'pw', 'n', true)}>do-register</button>
      <button onClick={() => logout()}>do-logout</button>
      <button onClick={() => deleteAccount()}>do-delete</button>
    </div>
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('AuthProvider', () => {
  it('mount 時に fetchMe が走り、結果を user に反映', async () => {
    vi.mocked(authModule.fetchMe).mockResolvedValue(mockUser)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    expect(screen.getByTestId('loading').textContent).toBe('loading')
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'))
    expect(screen.getByTestId('user').textContent).toBe('test@example.com')
  })

  it('fetchMe が reject した場合は user=null', async () => {
    vi.mocked(authModule.fetchMe).mockRejectedValue(new Error('fail'))
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'))
    expect(screen.getByTestId('user').textContent).toBe('none')
  })

  it('login 成功で user が更新される', async () => {
    vi.mocked(authModule.fetchMe).mockResolvedValue(null)
    vi.mocked(authModule.login).mockResolvedValue(mockUser)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'))
    await act(async () => {
      screen.getByText('do-login').click()
    })
    expect(screen.getByTestId('user').textContent).toBe('test@example.com')
  })

  it('register 成功で user が更新される', async () => {
    vi.mocked(authModule.fetchMe).mockResolvedValue(null)
    vi.mocked(authModule.register).mockResolvedValue(mockUser)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('loading').textContent).toBe('ready'))
    await act(async () => {
      screen.getByText('do-register').click()
    })
    expect(screen.getByTestId('user').textContent).toBe('test@example.com')
  })

  it('logout で user が null になる', async () => {
    vi.mocked(authModule.fetchMe).mockResolvedValue(mockUser)
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('test@example.com'))
    act(() => {
      screen.getByText('do-logout').click()
    })
    expect(screen.getByTestId('user').textContent).toBe('none')
    expect(authModule.logout).toHaveBeenCalled()
  })

  it('deleteAccount で user が null になる', async () => {
    vi.mocked(authModule.fetchMe).mockResolvedValue(mockUser)
    vi.mocked(authModule.deleteAccount).mockResolvedValue()
    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    )
    await waitFor(() => expect(screen.getByTestId('user').textContent).toBe('test@example.com'))
    await act(async () => {
      screen.getByText('do-delete').click()
    })
    expect(screen.getByTestId('user').textContent).toBe('none')
  })
})

describe('useAuth', () => {
  it('Provider 外で使うと throw する', () => {
    const orig = console.error
    console.error = () => {}
    try {
      expect(() => render(<Probe />)).toThrow('useAuth must be used within AuthProvider')
    } finally {
      console.error = orig
    }
  })
})
