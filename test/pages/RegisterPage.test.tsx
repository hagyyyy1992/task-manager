import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'

const registerMock = vi.fn()
vi.mock('@/useAuth', () => ({
  useAuth: () => ({ register: registerMock }),
}))

beforeEach(() => {
  registerMock.mockReset()
})
afterEach(() => {
  cleanup()
  vi.unstubAllEnvs()
})

async function renderWithFlag(allow: 'true' | 'false') {
  vi.stubEnv('VITE_ALLOW_REGISTRATION', allow)
  const { RegisterPage } = await import('@/pages/RegisterPage')
  return render(
    <MemoryRouter initialEntries={['/register']}>
      <Routes>
        <Route path="/register" element={<RegisterPage />} />
        <Route path="/" element={<div data-testid="home">ホーム</div>} />
        <Route path="/login" element={<div data-testid="login">login</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('RegisterPage', () => {
  it('VITE_ALLOW_REGISTRATION!=true なら disabled 画面', async () => {
    await renderWithFlag('false')
    expect(screen.getByText('新規登録は現在受け付けていません')).toBeInTheDocument()
    expect(screen.getByText('ログインへ戻る').closest('a')).toHaveAttribute('href', '/login')
  })

  it('VITE_ALLOW_REGISTRATION=true ならフォーム表示', async () => {
    await renderWithFlag('true')
    expect(screen.getByRole('heading', { name: '新規登録' })).toBeInTheDocument()
  })

  it('規約同意なしのままだと submit ボタンが disabled', async () => {
    await renderWithFlag('true')
    const submit = screen.getByRole('button', { name: /登録$/ })
    expect(submit).toBeDisabled()
  })

  it('入力 + 規約同意で submit すると register が呼ばれ / に遷移', async () => {
    registerMock.mockResolvedValue(undefined)
    await renderWithFlag('true')

    const inputs = document.querySelectorAll('input')
    const nameInput = inputs[0] as HTMLInputElement
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.change(nameInput, { target: { value: '名前' } })
    fireEvent.change(emailInput, { target: { value: 'a@a' } })
    fireEvent.change(pwInput, { target: { value: 'password1234' } })
    fireEvent.click(checkbox)

    fireEvent.click(screen.getByRole('button', { name: /登録$/ }))

    await waitFor(() =>
      expect(registerMock).toHaveBeenCalledWith('a@a', 'password1234', '名前', true),
    )
    await waitFor(() => expect(screen.getByTestId('home')).toBeInTheDocument())
  })

  it('register 失敗でエラーメッセージを表示', async () => {
    registerMock.mockRejectedValue(new Error('既に登録済み'))
    await renderWithFlag('true')

    const nameInput = document.querySelectorAll('input')[0] as HTMLInputElement
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.change(nameInput, { target: { value: '名前' } })
    fireEvent.change(emailInput, { target: { value: 'a@a' } })
    fireEvent.change(pwInput, { target: { value: 'password1234' } })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /登録$/ }))

    await waitFor(() => expect(screen.getByText('既に登録済み')).toBeInTheDocument())
  })

  it('Error 以外の reject は既定メッセージ', async () => {
    registerMock.mockRejectedValue('文字列')
    await renderWithFlag('true')

    const nameInput = document.querySelectorAll('input')[0] as HTMLInputElement
    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement
    const pwInput = document.querySelector('input[type="password"]') as HTMLInputElement
    const checkbox = document.querySelector('input[type="checkbox"]') as HTMLInputElement

    fireEvent.change(nameInput, { target: { value: '名前' } })
    fireEvent.change(emailInput, { target: { value: 'a@a' } })
    fireEvent.change(pwInput, { target: { value: 'password1234' } })
    fireEvent.click(checkbox)
    fireEvent.click(screen.getByRole('button', { name: /登録$/ }))

    await waitFor(() => expect(screen.getByText('Registration failed')).toBeInTheDocument())
  })
})
