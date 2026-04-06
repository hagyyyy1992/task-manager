import { useState } from 'react'
import type { Task, TaskStatus, TaskPriority, TaskCategory } from '../types'
import { CATEGORIES } from '../types'
import { generateId } from '../store'

interface Props {
  onAdd: (task: Task) => void
  onClose: () => void
  editTask?: Task
  onUpdate?: (task: Task) => void
}

export function TaskForm({ onAdd, onClose, editTask, onUpdate }: Props) {
  const [title, setTitle] = useState(editTask?.title ?? '')
  const [status, setStatus] = useState<TaskStatus>(editTask?.status ?? 'todo')
  const [priority, setPriority] = useState<TaskPriority>(editTask?.priority ?? 'medium')
  const [category, setCategory] = useState<TaskCategory>(editTask?.category ?? 'その他')
  const [dueDate, setDueDate] = useState(editTask?.dueDate ?? '')
  const [memo, setMemo] = useState(editTask?.memo ?? '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!title.trim()) return

    const now = new Date().toISOString()

    if (editTask && onUpdate) {
      onUpdate({
        ...editTask,
        title: title.trim(),
        status,
        priority,
        category,
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
        category,
        dueDate: dueDate || null,
        memo,
        createdAt: now,
        updatedAt: now,
      })
    }
    onClose()
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <form
        onSubmit={handleSubmit}
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
            <label className="block text-sm text-gray-600 dark:text-gray-400 mb-1">ステータス</label>
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
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as TaskCategory)}
              className="w-full border border-gray-300 dark:border-gray-600 rounded px-3 py-2 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100"
            >
              {CATEGORIES.map((c) => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
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
