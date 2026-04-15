import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../AuthContext'

export function AccountPage() {
  const { user, logout, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleting(true)
    try {
      await deleteAccount()
      navigate('/login')
    } catch (e) {
      console.error(e)
      setDeleting(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-2xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link
            to="/"
            className="text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 text-sm flex items-center gap-1"
          >
            ← 一覧
          </Link>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">アカウント情報</h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">名前</dt>
              <dd className="text-gray-900 dark:text-gray-100 mt-0.5">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">メールアドレス</dt>
              <dd className="text-gray-900 dark:text-gray-100 mt-0.5">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">登録日</dt>
              <dd className="text-gray-600 dark:text-gray-400 mt-0.5 text-sm">
                {new Date(user.createdAt).toLocaleDateString('ja-JP')}
              </dd>
            </div>
          </dl>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <button
            onClick={handleLogout}
            className="w-full py-2.5 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
          >
            ログアウト
          </button>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-red-600 mb-2">アカウント削除</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-4">
            アカウントを削除すると、元に戻すことはできません。
          </p>
          {confirming && (
            <p className="text-sm text-red-600 mb-3 font-medium">
              本当に削除しますか？もう一度押すと削除されます。
            </p>
          )}
          <button
            onClick={handleDelete}
            disabled={deleting}
            className={`px-4 py-2 rounded-lg text-sm font-medium ${
              confirming
                ? 'bg-red-600 text-white hover:bg-red-700'
                : 'border border-red-300 text-red-600 hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30'
            } disabled:opacity-50`}
          >
            {deleting ? '削除中...' : confirming ? '本当に削除する' : 'アカウントを削除'}
          </button>
          {confirming && !deleting && (
            <button
              onClick={() => setConfirming(false)}
              className="ml-2 px-4 py-2 text-gray-500 hover:text-gray-700 text-sm"
            >
              キャンセル
            </button>
          )}
        </div>
      </main>
    </div>
  )
}
