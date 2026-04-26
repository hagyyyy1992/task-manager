import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router-dom'
import { AppHeader } from '../components/AppHeader'
import type { Category, Task } from '../types'
import {
  loadCategories,
  loadTasks,
  apiCreateCategory,
  apiUpdateCategory,
  apiDeleteCategory,
} from '../store'

const PROTECTED_NAME = 'その他'

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [tasks, setTasks] = useState<Task[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  useEffect(() => {
    let cancelled = false
    Promise.all([loadCategories(), loadTasks()])
      .then(([cats, ts]) => {
        if (cancelled) return
        setCategories(cats)
        setTasks(ts)
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e))
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [])

  const counts = useMemo(() => {
    const map = new Map<string, number>()
    for (const t of tasks) map.set(t.category, (map.get(t.category) ?? 0) + 1)
    return map
  }, [tasks])

  const startEdit = (c: Category) => {
    setEditingId(c.id)
    setEditingName(c.name)
    setError('')
  }

  const cancelEdit = () => {
    setEditingId(null)
    setEditingName('')
  }

  const saveEdit = async (c: Category) => {
    const name = editingName.trim()
    if (!name) {
      setError('カテゴリ名を入力してください')
      return
    }
    if (name === c.name) {
      cancelEdit()
      return
    }
    try {
      const updated = await apiUpdateCategory(c.id, { name })
      setCategories((prev) => prev.map((x) => (x.id === c.id ? updated : x)))
      setTasks((prev) => prev.map((t) => (t.category === c.name ? { ...t, category: name } : t)))
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteCat = async (c: Category) => {
    const count = counts.get(c.name) ?? 0
    const message =
      count > 0
        ? `「${c.name}」を削除します。${count}件のタスクが「${PROTECTED_NAME}」に変更されます。よろしいですか？`
        : `「${c.name}」を削除しますか？`
    if (!confirm(message)) return
    try {
      await apiDeleteCategory(c.id)
      setCategories((prev) => {
        const remaining = prev.filter((x) => x.id !== c.id)
        if (count > 0 && !remaining.find((x) => x.name === PROTECTED_NAME)) {
          return [
            ...remaining,
            {
              id: `local-${PROTECTED_NAME}`,
              userId: c.userId,
              name: PROTECTED_NAME,
              sortOrder: remaining.length,
              createdAt: new Date().toISOString(),
            },
          ]
        }
        return remaining
      })
      setTasks((prev) =>
        prev.map((t) => (t.category === c.name ? { ...t, category: PROTECTED_NAME } : t)),
      )
      // 「その他」が新規作成されている可能性があるのでマスタを再取得
      if (count > 0) {
        loadCategories().then(setCategories).catch(console.error)
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    setCreating(true)
    setError('')
    try {
      const created = await apiCreateCategory(name, categories.length)
      setCategories((prev) => [...prev, created])
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <AppHeader />

      <main className="max-w-2xl mx-auto px-4 py-6 space-y-6">
        <div className="flex items-center gap-3">
          <Link
            to="/account"
            className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            ← アカウント
          </Link>
        </div>

        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-4">カテゴリ管理</h2>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-gray-400 text-sm">読み込み中...</p>
          ) : (
            <>
              <ul className="divide-y divide-gray-100 dark:divide-gray-700 mb-6">
                {categories.map((c) => {
                  const count = counts.get(c.name) ?? 0
                  const isEditing = editingId === c.id
                  const isProtected = c.name === PROTECTED_NAME
                  return (
                    <li key={c.id} className="py-3 flex items-center gap-3">
                      {isEditing ? (
                        <input
                          type="text"
                          value={editingName}
                          onChange={(e) => setEditingName(e.target.value)}
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') saveEdit(c)
                            if (e.key === 'Escape') cancelEdit()
                          }}
                          className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                        />
                      ) : (
                        <span className="flex-1 text-gray-900 dark:text-gray-100">
                          {c.name}
                          <span className="ml-2 text-xs text-gray-400">{count}件</span>
                        </span>
                      )}
                      {isEditing ? (
                        <>
                          <button
                            onClick={() => saveEdit(c)}
                            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
                          >
                            保存
                          </button>
                          <button
                            onClick={cancelEdit}
                            className="px-3 py-1 text-gray-500 dark:text-gray-400 rounded text-sm hover:bg-gray-100 dark:hover:bg-gray-700"
                          >
                            キャンセル
                          </button>
                        </>
                      ) : (
                        <>
                          {!isProtected && (
                            <>
                              <button
                                onClick={() => startEdit(c)}
                                className="px-3 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm"
                              >
                                編集
                              </button>
                              <button
                                onClick={() => deleteCat(c)}
                                className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
                              >
                                削除
                              </button>
                            </>
                          )}
                          {isProtected && (
                            <span className="px-3 py-1 text-xs text-gray-400">既定</span>
                          )}
                        </>
                      )}
                    </li>
                  )
                })}
                {categories.length === 0 && (
                  <li className="py-3 text-sm text-gray-400">カテゴリがありません</li>
                )}
              </ul>

              <form onSubmit={handleCreate} className="flex gap-2">
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="新しいカテゴリ名"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
                <button
                  type="submit"
                  disabled={creating || !newName.trim()}
                  className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  追加
                </button>
              </form>
            </>
          )}
        </div>
      </main>
    </div>
  )
}
