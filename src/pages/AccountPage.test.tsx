import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { AccountPage } from './AccountPage'

const logoutMock = vi.fn()
const deleteAccountMock = vi.fn()
const useAuthMock = vi.fn()

vi.mock('../useAuth', () => ({
  useAuth: () => useAuthMock(),
}))

vi.mock('../auth', () => ({
  changePassword: vi.fn(),
  authHeaders: () => ({}),
}))

import { changePassword } from '../auth'

const mockUser = {
  id: 'u1',
  email: 'a@a.com',
  name: 'テスト',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

beforeEach(() => {
  logoutMock.mockReset()
  deleteAccountMock.mockReset()
  useAuthMock.mockReturnValue({
    user: mockUser,
    logout: logoutMock,
    deleteAccount: deleteAccountMock,
  })
  vi.mocked(changePassword).mockReset()
})

afterEach(() => {
  cleanup()
})

function renderPage() {
  return render(
    <MemoryRouter initialEntries={['/account']}>
      <Routes>
        <Route path="/account" element={<AccountPage />} />
        <Route path="/login" element={<div data-testid="login">login</div>} />
        <Route path="/categories" element={<div>cats</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('AccountPage', () => {
  it('user が無ければ何も表示しない', () => {
    useAuthMock.mockReturnValue({
      user: null,
      logout: logoutMock,
      deleteAccount: deleteAccountMock,
    })
    const { container } = renderPage()
    expect(container.querySelector('main')).toBeNull()
  })

  it('アカウント情報を表示する', () => {
    renderPage()
    // 名前はヘッダー (Link) と main (dd) の 2 箇所、メールは main のみ
    expect(screen.getAllByText('テスト').length).toBeGreaterThan(0)
    expect(screen.getByText('a@a.com')).toBeInTheDocument()
  })

  it('ログアウトボタン（メイン）で logout 呼び出し→ /login へ遷移', () => {
    renderPage()
    // ヘッダーとメインの 2 箇所にあるので w-full を持つメイン側を選ぶ
    const buttons = screen.getAllByRole('button', { name: 'ログアウト' })
    const main = buttons.find((b) => b.className.includes('w-full'))!
    fireEvent.click(main)
    expect(logoutMock).toHaveBeenCalled()
    expect(screen.getByTestId('login')).toBeInTheDocument()
  })

  it('パスワード変更成功で成功メッセージ表示', async () => {
    vi.mocked(changePassword).mockResolvedValue()
    renderPage()
    const pwInputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(pwInputs[0], { target: { value: 'oldpassword' } })
    fireEvent.change(pwInputs[1], { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    await waitFor(() => expect(screen.getByText('パスワードを変更しました')).toBeInTheDocument())
    expect(changePassword).toHaveBeenCalledWith('oldpassword', 'newpassword')
  })

  it('パスワード変更失敗でエラー表示', async () => {
    vi.mocked(changePassword).mockRejectedValue(new Error('現在のパスワードが違います'))
    renderPage()
    const pwInputs = document.querySelectorAll('input[type="password"]')
    fireEvent.change(pwInputs[0], { target: { value: 'wrong' } })
    fireEvent.change(pwInputs[1], { target: { value: 'newpassword' } })
    fireEvent.click(screen.getByRole('button', { name: /パスワードを変更/ }))
    await waitFor(() => expect(screen.getByText('現在のパスワードが違います')).toBeInTheDocument())
  })

  it('削除ボタンを2回押すと deleteAccount が呼ばれ /login へ遷移', async () => {
    deleteAccountMock.mockResolvedValue(undefined)
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }))
    expect(screen.getByText(/本当に削除しますか/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: '本当に削除する' }))
    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalled())
    await waitFor(() => expect(screen.getByTestId('login')).toBeInTheDocument())
  })

  it('削除確認状態でキャンセルすると confirming が解除される', () => {
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }))
    expect(screen.getByRole('button', { name: '本当に削除する' })).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'キャンセル' }))
    expect(screen.queryByRole('button', { name: '本当に削除する' })).not.toBeInTheDocument()
  })

  it('削除失敗時は deleting=false に戻り再度押せる', async () => {
    deleteAccountMock.mockRejectedValue(new Error('fail'))
    renderPage()
    fireEvent.click(screen.getByRole('button', { name: 'アカウントを削除' }))
    fireEvent.click(screen.getByRole('button', { name: '本当に削除する' }))
    await waitFor(() => expect(deleteAccountMock).toHaveBeenCalled())
    // /login への遷移は起きない
    expect(screen.queryByTestId('login')).not.toBeInTheDocument()
  })
})
