import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { LoginPage } from '@/pages/LoginPage'

const loginMock = vi.fn()
vi.mock('@/useAuth', () => ({
  useAuth: () => ({ login: loginMock }),
}))

beforeEach(() => {
  loginMock.mockReset()
})
afterEach(() => {
  cleanup()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route path="/" element={<div data-testid="home">ホーム</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('LoginPage', () => {
  it('ログイン成功で / に遷移する', async () => {
    loginMock.mockResolvedValue(undefined)
    renderPage()
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'a@a.com' } })
    fireEvent.change(pwInput, { target: { value: 'password1234' } })
    fireEvent.click(screen.getByRole('button', { name: /ログイン$/ }))
    await waitFor(() => expect(loginMock).toHaveBeenCalledWith('a@a.com', 'password1234'))
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument())
  })

  it('ログイン失敗時はエラーメッセージを表示する', async () => {
    loginMock.mockRejectedValue(new Error('認証失敗'))
    renderPage()
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'a@a.com' } })
    fireEvent.change(pwInput, { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /ログイン$/ }))
    await waitFor(() => expect(screen.getByText('認証失敗')).toBeInTheDocument())
  })

  it('Error 以外の reject でも既定メッセージで表示する', async () => {
    loginMock.mockRejectedValue('文字列エラー')
    renderPage()
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'a@a.com' } })
    fireEvent.change(pwInput, { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /ログイン$/ }))
    await waitFor(() => expect(screen.getByText('Login failed')).toBeInTheDocument())
  })

  it('送信中はボタンが「ログイン中...」になり disabled', async () => {
    let resolve!: () => void
    loginMock.mockImplementation(() => new Promise<void>((r) => (resolve = r)))
    renderPage()
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    fireEvent.change(emailInput, { target: { value: 'a@a.com' } })
    fireEvent.change(pwInput, { target: { value: 'pw' } })
    fireEvent.click(screen.getByRole('button', { name: /ログイン$/ }))
    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'ログイン中...' })).toBeDisabled()
    })
    resolve()
  })
})
