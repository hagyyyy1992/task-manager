import { useState } from 'react'
import type { Task, TaskStatus, TaskPriority, Category } from '../types'
import { generateId, apiCreateCategory } from '../store'

interface Props {
  onAdd: (task: Task) => void
  onClose: () => void
  editTask?: Task
  onUpdate?: (task: Task) => void
  categories?: Category[]
  onCategoryCreated?: (category: Category) => void
}

export function TaskForm({
  onAdd,
  onClose,
  editTask,
  onUpdate,
  categories = [],
  onCategoryCreated,
}: Props) {
  const [title, setTitle] = useState(editTask?.title ?? '')
  const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority>(editTask?.priority ?? 'medium')
  const [category, setCategory] = useState(editTask?.category ?? 'その他')
  const [newCategoryInput, setNewCategoryInput] = useState('')
  const [showNewCategory, setShowNewCategory] = useState(false)
  const [dueDate, setDueDate] = useState(editTask?.dueDate ?? '')
  const [memo, setMemo] = useState(editTask?.memo ?? '')

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    let finalCategory = category
    if (showNewCategory && newCategoryInput.trim()) {
      finalCategory = newCategoryInput.trim()
      try {
        const created = await apiCreateCategory(finalCategory, categories.length)
        onCategoryCreated?.(created)
      } catch {
        // カテゴリが既に存在する場合は無視して続行
      }
    }

    const now = new Date().toISOString()

    if (editTask && onUpdate) {
      onUpdate({
        ...editTask,
        title: title.trim(),
        status,
        priority,
        category: finalCategory,
        dueDate: dueDate || null,
        memo,
        updatedAt: now,
      })
    } else {
      onAdd({
        id: generateId(),
        title: title.trim(),
        status,
        priority,
        category: finalCategory,
        dueDate: dueDate || null,
        memo,
        pinned: false,
        createdAt: now,
        updatedAt: now,
      })
    }
    onClose()
  }

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
      onClick={onClose}
    >
      <form
        onSubmit={handleSubmit}
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-gray-800 rounded-lg shadow-xl w-full max-w-lg p-6 space-y-4"
      >
        <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100">
          {editTask ? 'タスク編集' : 'タスク追加'}
        </h2>

        <input
          type="text"
          placeholder="タスク名"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">
              ステータス
            </label>
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as TaskStatus)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="todo">未着手</option>
              <option value="in_progress">進行中</option>
              <option value="done">完了</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">優先度</label>
            <select
              value={priority}
              onChange={(e) => setPriority(e.target.value as TaskPriority)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              <option value="high">高</option>
              <option value="medium">中</option>
              <option value="low">低</option>
            </select>
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">カテゴリ</label>
            {showNewCategory ? (
              <div className="flex gap-1">
                <input
                  type="text"
                  value={newCategoryInput}
                  onChange={(e) => setNewCategoryInput(e.target.value)}
                  placeholder="新しいカテゴリ名"
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
                />
                <button
                  type="button"
                  onClick={() => {
                    setShowNewCategory(false)
                    setNewCategoryInput('')
                  }}
                  className="px-2 text-gray-400 hover:text-gray-600 text-sm"
                  title="既存から選択"
                >
                  ✕
                </button>
              </div>
            ) : (
              <div className="flex gap-1">
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.name}>
                      {c.name}
                    </option>
                  ))}
                  {categories.length === 0 && <option value="その他">その他</option>}
                </select>
                <button
                  type="button"
                  onClick={() => setShowNewCategory(true)}
                  className="px-2 text-blue-500 hover:text-blue-700 text-sm whitespace-nowrap"
                  title="新規カテゴリ"
                >
                  + 新規
                </button>
              </div>
            )}
          </div>

          <div>
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">期限</label>
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            />
          </div>
        </div>

        <textarea
          placeholder="メモ（任意）"
          value={memo}
          onChange={(e) => setMemo(e.target.value)}
          rows={3}
          className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded"
          >
            キャンセル
          </button>
          <button
            type="submit"
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {editTask ? '更新' : '追加'}
          </button>
        </div>
      </form>
    </div>
  )
}
