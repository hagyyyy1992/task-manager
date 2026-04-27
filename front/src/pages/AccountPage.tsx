import { useEffect, useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useAuth } from '../useAuth'
import {
  changePassword,
  issueMcpToken,
  listMcpTokens,
  revokeMcpToken,
  type McpToken,
} from '../auth'
import { PasswordInput } from '../components/PasswordInput'
import { AppHeader } from '../components/AppHeader'

export function AccountPage() {
  const { user, logout, deleteAccount } = useAuth()
  const navigate = useNavigate()
  const [confirming, setConfirming] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [deletePassword, setDeletePassword] = useState('')
  const [deleteError, setDeleteError] = useState('')

  const [currentPassword, setCurrentPassword] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [pwError, setPwError] = useState('')
  const [pwSuccess, setPwSuccess] = useState('')
  const [pwSubmitting, setPwSubmitting] = useState(false)

  // MCP token 管理 (issue #37)
  const [mcpTokens, setMcpTokens] = useState<McpToken[] | null>(null)
  const [mcpError, setMcpError] = useState('')
  const [newMcpLabel, setNewMcpLabel] = useState('')
  const [issuing, setIssuing] = useState(false)
  // issue 直後の生 JWT は 1 度しか返らないので state に持って表示する
  const [justIssuedToken, setJustIssuedToken] = useState<string | null>(null)

  useEffect(() => {
    void (async () => {
      try {
        setMcpTokens(await listMcpTokens())
      } catch (e) {
        setMcpError(e instanceof Error ? e.message : 'Failed to load MCP tokens')
      }
    })()
  }, [])

  const handleIssueMcpToken = async (e: React.FormEvent) => {
    e.preventDefault()
    setMcpError('')
    setJustIssuedToken(null)
    setIssuing(true)
    try {
      const { token } = await issueMcpToken(newMcpLabel)
      setJustIssuedToken(token)
      setNewMcpLabel('')
      setMcpTokens(await listMcpTokens())
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setIssuing(false)
    }
  }

  const handleRevokeMcpToken = async (id: string, label: string) => {
    if (
      !confirm(
        `MCPトークン「${label || '(no label)'}」を取消しますか？このトークンを使っている連携は即座に動かなくなります。`,
      )
    )
      return
    setMcpError('')
    try {
      await revokeMcpToken(id)
      setMcpTokens(await listMcpTokens())
    } catch (err) {
      setMcpError(err instanceof Error ? err.message : 'Failed')
    }
  }

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault()
    setPwError('')
    setPwSuccess('')
    setPwSubmitting(true)
    try {
      await changePassword(currentPassword, newPassword)
      setPwSuccess('パスワードを変更しました')
      setCurrentPassword('')
      setNewPassword('')
    } catch (err) {
      setPwError(err instanceof Error ? err.message : 'Failed')
    } finally {
      setPwSubmitting(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login')
  }

  const handleDelete = async () => {
    if (!confirming) {
      setConfirming(true)
      return
    }
    setDeleteError('')
    if (!deletePassword) {
      setDeleteError('現在のパスワードを入力してください')
      return
    }
    setDeleting(true)
    try {
      await deleteAccount(deletePassword)
      navigate('/login')
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Failed')
      setDeleting(false)
    }
  }

  if (!user) return null

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">
            アカウント情報
          </h2>
          <dl className="space-y-3">
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                名前
              </dt>
              <dd className="text-gray-900 dark:text-gray-100 mt-0.5">{user.name}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                メールアドレス
              </dt>
              <dd className="text-gray-900 dark:text-gray-100 mt-0.5">{user.email}</dd>
            </div>
            <div>
              <dt className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                登録日
              </dt>
              <dd className="text-gray-600 dark:text-gray-400 mt-0.5 text-sm">
                {new Date(user.createdAt).toLocaleDateString('ja-JP')}
              </dd>
            </div>
          </dl>
        </div>

        <form
          onSubmit={handleChangePassword}
          className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4"
        >
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">パスワード変更</h3>

          {pwError && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2">
              {pwError}
            </div>
          )}
          {pwSuccess && (
            <div className="text-sm text-green-600 bg-green-50 dark:bg-green-900/30 dark:text-green-400 rounded-lg px-3 py-2">
              {pwSuccess}
            </div>
          )}

          <PasswordInput
            label="現在のパスワード"
            value={currentPassword}
            onChange={setCurrentPassword}
            required
            autoComplete="current-password"
          />
          <PasswordInput
            label="新しいパスワード（8文字以上）"
            value={newPassword}
            onChange={setNewPassword}
            required
            minLength={8}
            autoComplete="new-password"
          />

          <button
            type="submit"
            disabled={pwSubmitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
          >
            {pwSubmitting ? '変更中...' : 'パスワードを変更'}
          </button>
        </form>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100 mb-3">
            カテゴリ管理
          </h3>
          <Link
            to="/categories"
            className="inline-block px-4 py-2 border border-gray-300 dark:border-gray-600 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 text-sm font-medium"
          >
            カテゴリの編集・削除
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-4">
          <div>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">MCP トークン</h3>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Claude Code などの MCP クライアントから接続するための長期トークンを発行・取消します。
              トークンを紛失した場合は必ず取消してください。
            </p>
          </div>

          {mcpError && (
            <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2">
              {mcpError}
            </div>
          )}

          {justIssuedToken && (
            <div className="rounded-lg border border-yellow-300 bg-yellow-50 dark:border-yellow-700 dark:bg-yellow-900/30 px-3 py-3 space-y-2">
              <p className="text-xs font-semibold text-yellow-900 dark:text-yellow-200">
                ⚠️ このトークンは一度しか表示されません。今すぐコピーしてください。
              </p>
              <textarea
                readOnly
                value={justIssuedToken}
                onFocus={(e) => e.currentTarget.select()}
                rows={3}
                className="w-full text-xs font-mono bg-white dark:bg-gray-900 border border-gray-300 dark:border-gray-600 rounded p-2"
              />
              <button
                type="button"
                onClick={() => setJustIssuedToken(null)}
                className="text-xs text-gray-600 dark:text-gray-400 underline"
              >
                閉じる
              </button>
            </div>
          )}

          <form onSubmit={handleIssueMcpToken} className="flex gap-2">
            <input
              type="text"
              value={newMcpLabel}
              onChange={(e) => setNewMcpLabel(e.target.value)}
              placeholder="ラベル（例: macbook claude code）"
              maxLength={100}
              className="flex-1 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 dark:bg-gray-900 rounded-lg"
            />
            <button
              type="submit"
              disabled={issuing}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
            >
              {issuing ? '発行中...' : '新規発行'}
            </button>
          </form>

          {mcpTokens === null ? (
            <p className="text-xs text-gray-500">読み込み中...</p>
          ) : mcpTokens.length === 0 ? (
            <p className="text-xs text-gray-500 dark:text-gray-400">
              アクティブな MCP トークンはありません。
            </p>
          ) : (
            <ul className="divide-y divide-gray-200 dark:divide-gray-700">
              {mcpTokens.map((t) => (
                <li key={t.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm text-gray-900 dark:text-gray-100 truncate">
                      {t.label || <span className="text-gray-400">(no label)</span>}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      発行: {new Date(t.createdAt).toLocaleDateString('ja-JP')} ・ 最終利用:{' '}
                      {t.lastUsedAt ? new Date(t.lastUsedAt).toLocaleDateString('ja-JP') : '未使用'}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleRevokeMcpToken(t.id, t.label)}
                    className="px-3 py-1 text-xs text-red-600 border border-red-300 rounded hover:bg-red-50 dark:border-red-800 dark:hover:bg-red-900/30 shrink-0"
                  >
                    取消
                  </button>
                </li>
              ))}
            </ul>
          )}
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
            <>
              <p className="text-sm text-red-600 mb-3 font-medium">
                本当に削除しますか？確認のため現在のパスワードを入力してください。
              </p>
              <div className="mb-3">
                <PasswordInput
                  label="現在のパスワード"
                  value={deletePassword}
                  onChange={setDeletePassword}
                  required
                  autoComplete="current-password"
                />
              </div>
              {deleteError && (
                <div className="text-sm text-red-600 bg-red-50 dark:bg-red-900/30 dark:text-red-400 rounded-lg px-3 py-2 mb-3">
                  {deleteError}
                </div>
              )}
            </>
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
              onClick={() => {
                setConfirming(false)
                setDeletePassword('')
                setDeleteError('')
              }}
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
