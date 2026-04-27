import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { AppRouter } from './Router'

// 子ページを軽量モック
vi.mock('./App', () => ({
  default: () => <div data-testid="app-page">app</div>,
}))
vi.mock('./pages/TaskDetailPage', () => ({
  TaskDetailPage: () => <div data-testid="task-detail">detail</div>,
}))
vi.mock('./pages/LoginPage', () => ({
  LoginPage: () => <div data-testid="login-page">login</div>,
}))
vi.mock('./pages/RegisterPage', () => ({
  RegisterPage: () => <div data-testid="register-page">register</div>,
}))
vi.mock('./pages/AccountPage', () => ({
  AccountPage: () => <div data-testid="account-page">account</div>,
}))
vi.mock('./pages/CategoriesPage', () => ({
  CategoriesPage: () => <div data-testid="categories-page">cats</div>,
}))
vi.mock('./pages/TermsPage', () => ({
  TermsPage: () => <div data-testid="terms-page">terms</div>,
}))
vi.mock('./pages/PrivacyPage', () => ({
  PrivacyPage: () => <div data-testid="privacy-page">privacy</div>,
}))

const useAuthMock = vi.fn()
vi.mock('./useAuth', () => ({
  useAuth: () => useAuthMock(),
}))

beforeEach(() => {
  useAuthMock.mockReset()
})
afterEach(() => {
  cleanup()
})

function renderAt(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <AppRouter />
    </MemoryRouter>,
  )
}

describe('AppRouter', () => {
  it('loading 中は何も表示しない', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true })
    const { container } = renderAt('/')
    expect(container.querySelector('[data-testid]')).toBeNull()
  })

  it('未認証で / にアクセスすると /login に遷移', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('認証済みで / にアクセスすると App ページ', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/')
    expect(screen.getByTestId('app-page')).toBeInTheDocument()
  })

  it('認証済みで /login にアクセスすると / に遷移', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/login')
    expect(screen.getByTestId('app-page')).toBeInTheDocument()
  })

  it('未認証で /login にアクセスするとログインページ', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/login')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('PublicRoute の loading 中は何も表示しない（/login）', () => {
    useAuthMock.mockReturnValue({ user: null, loading: true })
    const { container } = renderAt('/login')
    expect(container.querySelector('[data-testid]')).toBeNull()
  })

  it('未認証で /register にアクセスすると登録ページ', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/register')
    expect(screen.getByTestId('register-page')).toBeInTheDocument()
  })

  it('認証済みで /task/:id にアクセスすると TaskDetail', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/task/abc')
    expect(screen.getByTestId('task-detail')).toBeInTheDocument()
  })

  it('未認証で /task/:id にアクセスすると /login へ', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/task/abc')
    expect(screen.getByTestId('login-page')).toBeInTheDocument()
  })

  it('認証済みで /account にアクセスすると AccountPage', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/account')
    expect(screen.getByTestId('account-page')).toBeInTheDocument()
  })

  it('認証済みで /categories にアクセスすると CategoriesPage', () => {
    useAuthMock.mockReturnValue({ user: { id: 'u1' }, loading: false })
    renderAt('/categories')
    expect(screen.getByTestId('categories-page')).toBeInTheDocument()
  })

  it('/terms は認証不要', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/terms')
    expect(screen.getByTestId('terms-page')).toBeInTheDocument()
  })

  it('/privacy は認証不要', () => {
    useAuthMock.mockReturnValue({ user: null, loading: false })
    renderAt('/privacy')
    expect(screen.getByTestId('privacy-page')).toBeInTheDocument()
  })
})
