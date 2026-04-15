import { useState, useEffect } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import type { Task, TaskStatus, TaskPriority, TaskCategory } from '../types'
import { CATEGORIES } from '../types'
import { loadTask, apiUpdateTask, apiDeleteTask } from '../store'

const STATUS_LABELS: Record<TaskStatus, string> = {
  todo: '未着手',
  in_progress: '進行中',
  done: '完了',
}

const STATUS_COLORS: Record<TaskStatus, string> = {
  todo: 'bg-gray-200 text-gray-700 dark:bg-gray-600 dark:text-gray-200',
  in_progress: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200',
  done: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200',
}

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  high: '高',
  medium: '中',
  low: '低',
}

const PRIORITY_DOTS: Record<TaskPriority, string> = {
  high: 'bg-red-500',
  medium: 'bg-yellow-500',
  low: 'bg-gray-400',
}

export function TaskDetailPage() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const [task, setTask] = useState<Task | null>(null)
  const [loading, setLoading] = useState(true)
  const [editing, setEditing] = useState(false)

  const [title, setTitle] = useState('')
  const [status, setStatus] = useState<TaskStatus>('todo')
  const [priority, setPriority] = useState<TaskPriority>('medium')
  const [category, setCategory] = useState<TaskCategory>('その他')
  const [dueDate, setDueDate] = useState('')
  const [memo, setMemo] = useState('')

  useEffect(() => {
    if (!id) return
    loadTask(id)
      .then((t) => {
        setTask(t)
        if (t) {
          setTitle(t.title)
          setStatus(t.status)
          setPriority(t.priority)
          setCategory(t.category)
          setDueDate(t.dueDate ?? '')
          setMemo(t.memo)
        }
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!task || !title.trim()) return
    const now = new Date().toISOString()
    const updated: Task = {
      ...task,
      title: title.trim(),
      status,
      priority,
      category,
      dueDate: dueDate || null,
      memo,
      updatedAt: now,
    }
    setTask(updated)
    setEditing(false)
    try {
      await apiUpdateTask(task.id, {
        title: updated.title,
        status: updated.status,
        priority: updated.priority,
        memo: updated.memo,
        dueDate: updated.dueDate,
      })
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async () => {
    if (!task || !confirm('このタスクを削除しますか？')) return
    try {
      await apiDeleteTask(task.id)
      navigate('/')
    } catch (e) {
      console.error(e)
    }
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center">
        <p className="text-gray-400">読み込み中...</p>
      </div>
    )
  }

  if (!task) {
    return (
      <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex flex-col items-center justify-center gap-4">
        <p className="text-gray-400">タスクが見つかりません</p>
        <Link to="/" className="text-blue-500 hover:underline">一覧に戻る</Link>
      </div>
    )
  }

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
          <div className="flex gap-2">
            {!editing && (
              <>
                <button
                  onClick={() => setEditing(true)}
                  className="px-3 py-1.5 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm font-medium"
                >
                  編集
                </button>
                <button
                  onClick={handleDelete}
                  className="px-3 py-1.5 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm font-medium"
                >
                  削除
                </button>
              </>
            )}
          </div>
        </div>
      </header>

      <main className="max-w-2xl mx-auto px-4 py-6">
        {editing ? (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6 space-y-5">
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              autoFocus
              className="w-full text-xl font-bold border-0 border-b-2 border-gray-200 dark:border-gray-600 bg-transparent text-gray-900 dark:text-gray-100 pb-2 focus:outline-none focus:border-blue-500"
              placeholder="タスク名"
            />

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">ステータス</label>
                <select
                  value={status}
                  onChange={(e) => setStatus(e.target.value as TaskStatus)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="todo">未着手</option>
                  <option value="in_progress">進行中</option>
                  <option value="done">完了</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">優先度</label>
                <select
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as TaskPriority)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">カテゴリ</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as TaskCategory)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                >
                  {CATEGORIES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">期限</label>
                <input
                  type="date"
                  value={dueDate}
                  onChange={(e) => setDueDate(e.target.value)}
                  className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs text-gray-500 dark:text-gray-400 mb-1.5 uppercase tracking-wider">メモ</label>
              <textarea
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                rows={8}
                className="w-full border border-gray-200 dark:border-gray-600 rounded-lg px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => {
                  setEditing(false)
                  setTitle(task.title)
                  setStatus(task.status)
                  setPriority(task.priority)
                  setCategory(task.category)
                  setDueDate(task.dueDate ?? '')
                  setMemo(task.memo)
                }}
                className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg text-sm"
              >
                キャンセル
              </button>
              <button
                onClick={handleSave}
                className="px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
              >
                保存
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-6">
            {/* Title & Status */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm p-6">
              <div className="flex items-start gap-3">
                <div className={`mt-1.5 w-3 h-3 rounded-full shrink-0 ${PRIORITY_DOTS[task.priority]}`} />
                <div className="flex-1">
                  <h2 className={`text-xl font-bold text-gray-900 dark:text-gray-100 ${task.status === 'done' ? 'line-through opacity-60' : ''}`}>
                    {task.title}
                  </h2>
                  <div className="flex items-center gap-2 mt-2">
                    <span className={`text-xs px-2 py-1 rounded-full ${STATUS_COLORS[task.status]}`}>
                      {STATUS_LABELS[task.status]}
                    </span>
                    <span className="text-xs px-2 py-1 rounded-full bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                      {task.category}
                    </span>
                    <span className="text-xs text-gray-400">
                      優先度: {PRIORITY_LABELS[task.priority]}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Details */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm divide-y divide-gray-100 dark:divide-gray-700">
              {task.dueDate && (
                <div className="px-6 py-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">期限</div>
                  <div className="text-gray-900 dark:text-gray-100">{task.dueDate}</div>
                </div>
              )}

              {task.memo && (
                <div className="px-6 py-4">
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-2">メモ</div>
                  <div className="text-gray-700 dark:text-gray-300 text-sm whitespace-pre-wrap leading-relaxed">
                    {task.memo}
                  </div>
                </div>
              )}

              <div className="px-6 py-4 flex gap-6">
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">作成日</div>
                  <div className="text-gray-600 dark:text-gray-400 text-sm">
                    {new Date(task.createdAt).toLocaleDateString('ja-JP')}
                  </div>
                </div>
                <div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 uppercase tracking-wider mb-1">更新日</div>
                  <div className="text-gray-600 dark:text-gray-400 text-sm">
                    {new Date(task.updatedAt).toLocaleDateString('ja-JP')}
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
