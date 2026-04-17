import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'
import { PasswordInput } from '../components/PasswordInput'

function RegisterDisabled() {
  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
      <div className="w-full max-w-sm text-center">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-100 mb-4">Task Manager</h1>
        <p className="text-sm text-gray-600 dark:text-gray-400 mb-6">新規登録は現在受け付けていません</p>
        <Link to="/login" className="text-blue-600 hover:underline text-sm">ログインへ戻る</Link>
      </div>
    </div>
  )
}

export function RegisterPage() {
  if (import.meta.env.VITE_ALLOW_REGISTRATION !== 'true') {
    return <RegisterDisabled />
  }
  return <RegisterForm />
}

function RegisterForm() {
  const { register } = useAuth()
  const navigate = useNavigate()
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [termsAgreed, setTermsAgreed] = useState(false)
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      await register(email, password, name, termsAgreed)
      navigate('/')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Registration failed')
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

        <form onSubmit={handleSubmit} className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-gray-100">新規登録</h2>

          {error && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">名前</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              required
              autoFocus
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">メールアドレス</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <PasswordInput label="パスワード（8文字以上）" value={password} onChange={setPassword} required minLength={8} autoComplete="new-password" />

          <label className="flex items-start gap-2 text-xs text-gray-500 dark:text-gray-400 cursor-pointer">
            <input
              type="checkbox"
              checked={termsAgreed}
              onChange={(e) => setTermsAgreed(e.target.checked)}
              className="mt-0.5 rounded border-gray-300 dark:border-gray-600"
            />
            <span>
              <Link to="/terms" className="text-blue-600 hover:underline">利用規約</Link>および<Link to="/privacy" className="text-blue-600 hover:underline">プライバシーポリシー</Link>に同意します
            </span>
          </label>

          <button
            type="submit"
            disabled={submitting || !termsAgreed}
            className="w-full py-2.5 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? '登録中...' : '登録'}
          </button>

          <p className="text-center text-sm text-gray-500 dark:text-gray-400">
            アカウントをお持ちの場合は{' '}
            <Link to="/login" className="text-blue-600 hover:underline">ログイン</Link>
          </p>
        </form>
      </div>
    </div>
  )
}
