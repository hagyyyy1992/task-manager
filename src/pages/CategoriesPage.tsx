import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  arrayMove,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { AppHeader } from '../components/AppHeader'
import type { Category } from '../types'
import {
  loadCategories,
  apiCreateCategory,
  apiUpdateCategory,
  apiDeleteCategory,
  apiReorderCategories,
} from '../store'

const PROTECTED_NAME = 'その他'

interface RowProps {
  category: Category
  isEditing: boolean
  editingName: string
  onEditingNameChange: (v: string) => void
  onStartEdit: () => void
  onCancelEdit: () => void
  onSaveEdit: () => void
  onDelete: () => void
}

function CategoryRow({
  category,
  isEditing,
  editingName,
  onEditingNameChange,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
}: RowProps) {
  const isProtected = category.name === PROTECTED_NAME
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: category.id,
    disabled: isEditing,
  })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : undefined,
  }

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="py-3 flex items-center gap-3 bg-white dark:bg-gray-800"
    >
      <button
        {...attributes}
        {...listeners}
        disabled={isEditing}
        className="shrink-0 cursor-grab active:cursor-grabbing text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 disabled:cursor-not-allowed disabled:opacity-30 touch-none px-1"
        title="ドラッグで並べ替え"
        aria-label={`${category.name} を並べ替え`}
      >
        ⠿
      </button>

      {isEditing ? (
        <input
          type="text"
          value={editingName}
          onChange={(e) => onEditingNameChange(e.target.value)}
          autoFocus
          onKeyDown={(e) => {
            if (e.key === 'Enter') onSaveEdit()
            if (e.key === 'Escape') onCancelEdit()
          }}
          className="flex-1 border border-gray-300 dark:border-gray-600 rounded px-3 py-1.5 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-100 text-sm"
        />
      ) : (
        <span className="flex-1 text-gray-900 dark:text-gray-100">
          {category.name}
          <span className="ml-2 text-xs text-gray-400">{category.taskCount ?? 0}件</span>
        </span>
      )}
      {isEditing ? (
        <>
          <button
            onClick={onSaveEdit}
            className="px-3 py-1 bg-blue-600 text-white rounded text-sm hover:bg-blue-700"
          >
            保存
          </button>
          <button
            onClick={onCancelEdit}
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
                onClick={onStartEdit}
                className="px-3 py-1 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-900/30 rounded text-sm"
              >
                編集
              </button>
              <button
                onClick={onDelete}
                className="px-3 py-1 text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded text-sm"
              >
                削除
              </button>
            </>
          )}
          {isProtected && <span className="px-3 py-1 text-xs text-gray-400">既定</span>}
        </>
      )}
    </li>
  )
}

export function CategoriesPage() {
  const [categories, setCategories] = useState<Category[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')

  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 4 } }))

  useEffect(() => {
    let cancelled = false
    loadCategories()
      .then((cats) => {
        if (!cancelled) setCategories(cats)
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
    if (categories.some((x) => x.id !== c.id && x.name === name)) {
      setError('同じ名前のカテゴリが既に存在します')
      return
    }
    try {
      const updated = await apiUpdateCategory(c.id, { name })
      // taskCount はサーバから再取得
      const fresh = await loadCategories()
      setCategories(fresh.map((x) => (x.id === c.id ? { ...updated, taskCount: x.taskCount } : x)))
      cancelEdit()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const deleteCat = async (c: Category) => {
    const count = c.taskCount ?? 0
    const message =
      count > 0
        ? `「${c.name}」を削除します。${count}件のタスクが「${PROTECTED_NAME}」に変更されます。よろしいですか？`
        : `「${c.name}」を削除しますか？`
    if (!confirm(message)) return
    try {
      await apiDeleteCategory(c.id)
      // 「その他」が新規作成されたり taskCount が増えたりするのでサーバから再取得
      const fresh = await loadCategories()
      setCategories(fresh)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    }
  }

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault()
    const name = newName.trim()
    if (!name) return
    if (categories.some((c) => c.name === name)) {
      setError('同じ名前のカテゴリが既に存在します')
      return
    }
    setCreating(true)
    setError('')
    try {
      const created = await apiCreateCategory(name, categories.length)
      setCategories((prev) => [...prev, { ...created, taskCount: 0 }])
      setNewName('')
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setCreating(false)
    }
  }

  const handleDragEnd = async (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex((c) => c.id === active.id)
    const newIndex = categories.findIndex((c) => c.id === over.id)
    if (oldIndex < 0 || newIndex < 0) return

    const reordered = arrayMove(categories, oldIndex, newIndex)
    const previous = categories
    setCategories(reordered) // 楽観更新
    try {
      const fresh = await apiReorderCategories(reordered.map((c) => c.id))
      // taskCount を保持しつつサーバの sortOrder を反映
      const countMap = new Map(reordered.map((c) => [c.id, c.taskCount ?? 0]))
      setCategories(fresh.map((c) => ({ ...c, taskCount: countMap.get(c.id) ?? 0 })))
    } catch (e) {
      setCategories(previous) // 失敗時はロールバック
      setError(e instanceof Error ? e.message : String(e))
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
          <h2 className="text-lg font-bold text-gray-900 dark:text-gray-100 mb-1">カテゴリ管理</h2>
          <p className="text-xs text-gray-500 dark:text-gray-400 mb-4">
            ⠿ をドラッグして並び順を変更できます
          </p>

          {error && (
            <div className="mb-4 px-3 py-2 rounded bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300 text-sm">
              {error}
            </div>
          )}

          {loading ? (
            <p className="text-gray-400 text-sm">読み込み中...</p>
          ) : (
            <>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={categories.map((c) => c.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <ul className="divide-y divide-gray-100 dark:divide-gray-700 mb-6">
                    {categories.map((c) => (
                      <CategoryRow
                        key={c.id}
                        category={c}
                        isEditing={editingId === c.id}
                        editingName={editingName}
                        onEditingNameChange={setEditingName}
                        onStartEdit={() => startEdit(c)}
                        onCancelEdit={cancelEdit}
                        onSaveEdit={() => saveEdit(c)}
                        onDelete={() => deleteCat(c)}
                      />
                    ))}
                    {categories.length === 0 && (
                      <li className="py-3 text-sm text-gray-400">カテゴリがありません</li>
                    )}
                  </ul>
                </SortableContext>
              </DndContext>

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
