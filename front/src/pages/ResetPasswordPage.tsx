import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { resetPassword } from '../auth'
import { PasswordInput } from '../components/PasswordInput'

export function ResetPasswordPage() {
  const [searchParams] = useSearchParams()
  const token = searchParams.get('token') ?? ''

  const [newPassword, setNewPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [done, setDone] = useState(false)
  const [error, setError] = useState('')

  if (!token) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
        <div className="w-full max-w-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
            <p className="text-sm text-red-600 dark:text-red-400">
              無効なリンクです。パスワードリセットのリンクを再度ご確認ください。
            </p>
            <Link to="/forgot-password" className="block text-center text-sm text-blue-600 hover:underline">
              パスワードリセットをやり直す
            </Link>
          </div>
        </div>
      </div>
    )
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await resetPassword(token, newPassword)
      setDone(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'パスワードのリセットに失敗しました')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm">
        <h1 className="text-2xl font-bold text-center text-gray-900 dark:text-gray-100 mb-8">
          Task Manager
        </h1>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">
            新しいパスワードを設定
          </h2>

          {done ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                パスワードを変更しました。新しいパスワードでログインしてください。
              </p>
              <Link
                to="/login"
                className="block text-center py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                ログインする
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2">
                  {error === 'invalid or expired token'
                    ? 'リンクが無効または期限切れです。再度パスワードリセットをお試しください。'
                    : error}
                </div>
              )}

              <PasswordInput
                label="新しいパスワード (12文字以上、英字と数字を含む)"
                value={newPassword}
                onChange={setNewPassword}
                required
                minLength={12}
                autoFocus
                autoComplete="new-password"
              />

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '変更中...' : 'パスワードを変更する'}
              </button>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                <Link to="/forgot-password" className="text-blue-600 hover:underline">
                  リセットメールを再送する
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
