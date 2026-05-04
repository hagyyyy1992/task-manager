import { useState } from 'react'
import { Link } from 'react-router-dom'
import { forgotPassword } from '../auth'

export function ForgotPasswordPage() {
  const [email, setEmail] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await forgotPassword(email)
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'リクエストに失敗しました')
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
            パスワードをお忘れの方
          </h2>

          {sent ? (
            <div className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                入力されたメールアドレスにアカウントが存在する場合、パスワードリセットのリンクをお送りしました。メールをご確認ください。
              </p>
              <Link
                to="/login"
                className="block text-center text-sm text-blue-600 hover:underline"
              >
                ログインページへ戻る
              </Link>
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                登録済みのメールアドレスを入力してください。パスワードリセットのリンクをお送りします。
              </p>

              {error && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2">
                  {error}
                </div>
              )}

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">
                  メールアドレス
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  autoFocus
                  autoComplete="email"
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                {submitting ? '送信中...' : 'リセットリンクを送信'}
              </button>

              <p className="text-center text-sm text-gray-500 dark:text-gray-400">
                <Link to="/login" className="text-blue-600 hover:underline">
                  ログインページへ戻る
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
