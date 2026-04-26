import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AppHeader } from './AppHeader'

const logoutMock = vi.fn()

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', email: 'a@a', name: 'テスト', createdAt: '', updatedAt: '' },
    logout: logoutMock,
  }),
}))

beforeEach(() => {
  logoutMock.mockClear()
})

afterEach(() => {
  cleanup()
})

describe('AppHeader', () => {
  it('user 名と /account へのリンクを表示する', () => {
    render(
      <MemoryRouter>
        <AppHeader />
      </MemoryRouter>,
    )
    expect(screen.getByText('Task Manager')).toBeInTheDocument()
    expect(screen.getByText('テスト')).toBeInTheDocument()
    expect(screen.getByText('テスト').closest('a')).toHaveAttribute('href', '/account')
  })

  it('children は右側に表示される', () => {
    render(
      <MemoryRouter>
        <AppHeader>
          <button>追加</button>
        </AppHeader>
      </MemoryRouter>,
    )
    expect(screen.getByText('追加')).toBeInTheDocument()
  })

  it('ログアウトクリックで logout() が呼ばれ /login に遷移する', () => {
    render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/" element={<AppHeader />} />
          <Route path="/login" element={<div data-testid="login">ログインページ</div>} />
        </Routes>
      </MemoryRouter>,
    )
    fireEvent.click(screen.getByText('ログアウト'))
    expect(logoutMock).toHaveBeenCalledTimes(1)
    expect(screen.getByTestId('login')).toBeInTheDocument()
  })
})
