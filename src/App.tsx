import { useState, useEffect, useCallback, useMemo } from 'react'
import type { Task, TaskStatus, TaskCategory } from './types'
import { CATEGORIES } from './types'
import { loadTasks, saveTasks } from './store'
import { TaskForm } from './components/TaskForm'
import { TaskItem } from './components/TaskItem'
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import type { DragEndEvent } from '@dnd-kit/core'
import {
  SortableContext,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import './index.css'

type FilterStatus = TaskStatus | 'all'
type FilterCategory = TaskCategory | 'all'
type SortKey = 'manual' | 'priority' | 'dueDate' | 'category' | 'createdAt'

function App() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [showForm, setShowForm] = useState(false)
  const [editingTask, setEditingTask] = useState<Task | undefined>()
  const [filterStatus, setFilterStatus] = useState<FilterStatus>('all')
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all')
  const [sortKey, setSortKey] = useState<SortKey>('priority')

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  )

  useEffect(() => {
    let cancelled = false
    loadTasks().then((data) => {
      if (!cancelled) setTasks(data)
    })
    return () => { cancelled = true }
  }, [])

  const persist = useCallback((next: Task[]) => {
    setTasks(next)
    saveTasks(next)
  }, [])

  const addTask = (task: Task) => persist([task, ...tasks])

  const updateTask = (updated: Task) =>
    persist(tasks.map((t) => (t.id === updated.id ? updated : t)))

  const deleteTask = (id: string) => {
    if (!confirm('削除しますか？')) return
    persist(tasks.filter((t) => t.id !== id))
  }

  const changeStatus = (id: string, status: TaskStatus) =>
    persist(
      tasks.map((t) =>
        t.id === id ? { ...t, status, updatedAt: new Date().toISOString() } : t
      )
    )

  const filtered = tasks.filter((t) => {
    if (filterStatus !== 'all' && t.status !== filterStatus) return false
    if (filterCategory !== 'all' && t.category !== filterCategory) return false
    return true
  })

  const displayTasks = useMemo(() => {
    if (sortKey === 'manual') return filtered

    return [...filtered].sort((a, b) => {
      if (a.status === 'done' && b.status !== 'done') return 1
      if (a.status !== 'done' && b.status === 'done') return -1

      const priorityOrder = { high: 0, medium: 1, low: 2 }

      switch (sortKey) {
        case 'dueDate': {
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }
        case 'category': {
          const cmp = a.category.localeCompare(b.category)
          if (cmp !== 0) return cmp
          return priorityOrder[a.priority] - priorityOrder[b.priority]
        }
        case 'createdAt':
          return b.createdAt.localeCompare(a.createdAt)
        case 'priority':
        default: {
          const pDiff = priorityOrder[a.priority] - priorityOrder[b.priority]
          if (pDiff !== 0) return pDiff
          if (a.dueDate && b.dueDate) return a.dueDate.localeCompare(b.dueDate)
          if (a.dueDate) return -1
          if (b.dueDate) return 1
          return b.createdAt.localeCompare(a.createdAt)
        }
      }
    })
  }, [filtered, sortKey])

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over) return

    // 現在の表示順をベースにする
    const currentOrder = [...displayTasks]

    if (active.id !== over.id) {
      const oldIndex = currentOrder.findIndex((t) => t.id === active.id)
      const newIndex = currentOrder.findIndex((t) => t.id === over.id)
      if (oldIndex !== -1 && newIndex !== -1) {
        const [moved] = currentOrder.splice(oldIndex, 1)
        currentOrder.splice(newIndex, 0, moved)
      }
    }

    // ドラッグしたら常に手動モードに切り替え、現在の表示順を保存
    const displayedIds = new Set(currentOrder.map((t) => t.id))
    const hidden = tasks.filter((t) => !displayedIds.has(t.id))
    const next = [...currentOrder, ...hidden]

    setSortKey('manual')
    setTasks(next)
    saveTasks(next)
  }

  const counts = {
    all: tasks.length,
    todo: tasks.filter((t) => t.status === 'todo').length,
    in_progress: tasks.filter((t) => t.status === 'in_progress').length,
    done: tasks.filter((t) => t.status === 'done').length,
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-900">
      <header className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 sticky top-0 z-10">
        <div className="max-w-3xl mx-auto px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold text-gray-900 dark:text-gray-100">Task Manager</h1>
          <div className="flex gap-2">
            <button
              onClick={() => loadTasks().then(setTasks)}
              className="px-3 py-1.5 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700 rounded text-sm"
              title="更新"
            >
              ↻
            </button>
            <button
              onClick={() => {
                setEditingTask(undefined)
                setShowForm(true)
              }}
              className="px-3 py-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 text-sm font-medium"
            >
              + 追加
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 py-4">
        {/* Filters */}
        <div className="flex flex-wrap gap-2 mb-4">
          <div className="flex gap-1 bg-white dark:bg-gray-800 rounded-lg p-1 shadow-sm">
            {(
              [
                ['all', `全て (${counts.all})`],
                ['todo', `未着手 (${counts.todo})`],
                ['in_progress', `進行中 (${counts.in_progress})`],
                ['done', `完了 (${counts.done})`],
              ] as const
            ).map(([val, label]) => (
              <button
                key={val}
                onClick={() => setFilterStatus(val)}
                className={`px-2.5 py-1 rounded text-sm transition-colors ${
                  filterStatus === val
                    ? 'bg-blue-600 text-white'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                }`}
              >
                {label}
              </button>
            ))}
          </div>

          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value as FilterCategory)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-sm text-gray-600 dark:text-gray-400 shadow-sm"
          >
            <option value="all">全カテゴリ</option>
            {CATEGORIES.map((c) => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>

          <select
            value={sortKey}
            onChange={(e) => setSortKey(e.target.value as SortKey)}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg px-2.5 py-1 text-sm text-gray-600 dark:text-gray-400 shadow-sm"
          >
            <option value="manual">手動（D&D）</option>
            <option value="priority">優先度順</option>
            <option value="dueDate">期限順</option>
            <option value="category">カテゴリ順</option>
            <option value="createdAt">作成日順</option>
          </select>
        </div>

        {/* Task List */}
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragEnd={handleDragEnd}
        >
          <SortableContext
            items={displayTasks.map((t) => t.id)}
            strategy={verticalListSortingStrategy}
          >
            <div className="space-y-2">
              {displayTasks.length === 0 ? (
                <p className="text-center text-gray-400 dark:text-gray-500 py-12">
                  {tasks.length === 0 ? 'タスクがありません' : 'フィルタに一致するタスクがありません'}
                </p>
              ) : (
                displayTasks.map((task) => (
                  <TaskItem
                    key={task.id}
                    task={task}
                    onStatusChange={changeStatus}
                    onEdit={(t) => {
                      setEditingTask(t)
                      setShowForm(true)
                    }}
                    onDelete={deleteTask}
                    isDraggable={sortKey === 'manual'}
                  />
                ))
              )}
            </div>
          </SortableContext>
        </DndContext>
      </main>

      {showForm && (
        <TaskForm
          onAdd={addTask}
          onClose={() => {
            setShowForm(false)
            setEditingTask(undefined)
          }}
          editTask={editingTask}
          onUpdate={updateTask}
        />
      )}
    </div>
  )
}

export default App
