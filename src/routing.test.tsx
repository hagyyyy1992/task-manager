import { describe, it, expect, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Routes, Route, Navigate } from 'react-router-dom'

function ProtectedRoute({ children, isAuth }: { children: React.ReactNode; isAuth: boolean }) {
  if (!isAuth) return <Navigate to="/login" replace />
  return <>{children}</>
}

function PublicRoute({ children, isAuth }: { children: React.ReactNode; isAuth: boolean }) {
  if (isAuth) return <Navigate to="/" replace />
  return <>{children}</>
}

describe('routing', () => {
  it('redirects unauthenticated user to /login', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">ログイン</div>} />
          <Route path="/" element={<ProtectedRoute isAuth={false}><div data-testid="list">タスク一覧</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('login')).toBeInTheDocument()
    unmount()
  })

  it('shows task list for authenticated user', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">ログイン</div>} />
          <Route path="/" element={<ProtectedRoute isAuth={true}><div data-testid="list">タスク一覧</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('list')).toBeInTheDocument()
    unmount()
  })

  it('redirects authenticated user from /login to /', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<PublicRoute isAuth={true}><div>ログインフォーム</div></PublicRoute>} />
          <Route path="/" element={<div data-testid="list">タスク一覧</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('list')).toBeInTheDocument()
    unmount()
  })

  it('shows login page for unauthenticated user', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/login']}>
        <Routes>
          <Route path="/login" element={<PublicRoute isAuth={false}><div data-testid="login">ログインフォーム</div></PublicRoute>} />
          <Route path="/" element={<div>タスク一覧</div>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('login')).toBeInTheDocument()
    unmount()
  })

  it('protects /task/:id route', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/task/abc']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">ログイン</div>} />
          <Route path="/task/:id" element={<ProtectedRoute isAuth={false}><div>タスク詳細</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('login')).toBeInTheDocument()
    unmount()
  })

  it('protects /account route', () => {
    const { unmount } = render(
      <MemoryRouter initialEntries={['/account']}>
        <Routes>
          <Route path="/login" element={<div data-testid="login">ログイン</div>} />
          <Route path="/account" element={<ProtectedRoute isAuth={false}><div>アカウント</div></ProtectedRoute>} />
        </Routes>
      </MemoryRouter>
    )
    expect(screen.getByTestId('login')).toBeInTheDocument()
    unmount()
  })
})
