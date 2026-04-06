import type { Task, TaskStatus } from '../types'

interface Props {
  task: Task
  onStatusChange: (id: string, status: TaskStatus) => void
  onEdit: (task: Task) => void
  onDelete: (id: string) => void
}

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

const PRIORITY_COLORS: Record<string, string> = {
  high: 'border-l-red-500',
  medium: 'border-l-yellow-500',
  low: 'border-l-gray-300 dark:border-l-gray-600',
}

const NEXT_STATUS: Record<TaskStatus, TaskStatus> = {
  todo: 'in_progress',
  in_progress: 'done',
  done: 'todo',
}

function formatDueDate(dateStr: string | null): { text: string; overdue: boolean } {
  if (!dateStr) return { text: '', overdue: false }
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const due = new Date(dateStr + 'T00:00:00')
  const diff = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24))

  if (diff < 0) return { text: `${Math.abs(diff)}日超過`, overdue: true }
  if (diff === 0) return { text: '今日', overdue: false }
  if (diff === 1) return { text: '明日', overdue: false }
  return { text: dateStr, overdue: false }
}

export function TaskItem({ task, onStatusChange, onEdit, onDelete }: Props) {
  const due = formatDueDate(task.dueDate)
  const isDone = task.status === 'done'

  return (
    <div
      className={`border-l-4 ${PRIORITY_COLORS[task.priority]} bg-white dark:bg-gray-800 rounded-r-lg shadow-sm p-3 flex items-start gap-3 group ${isDone ? 'opacity-60' : ''}`}
    >
      <button
        onClick={() => onStatusChange(task.id, NEXT_STATUS[task.status])}
        className={`mt-0.5 shrink-0 w-5 h-5 rounded-full border-2 flex items-center justify-center text-xs transition-colors ${
          isDone
            ? 'border-green-500 bg-green-500 text-white'
            : task.status === 'in_progress'
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-950'
              : 'border-gray-300 dark:border-gray-600 hover:border-blue-400'
        }`}
        title={`→ ${STATUS_LABELS[NEXT_STATUS[task.status]]}`}
      >
        {isDone && '✓'}
      </button>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <span className={`font-medium text-gray-900 dark:text-gray-100 ${isDone ? 'line-through' : ''}`}>
            {task.title}
          </span>
          <span className={`text-xs px-1.5 py-0.5 rounded ${STATUS_COLORS[task.status]}`}>
            {STATUS_LABELS[task.status]}
          </span>
          <span className="text-xs px-1.5 py-0.5 rounded bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300">
            {task.category}
          </span>
        </div>

        {(task.memo || due.text) && (
          <div className="mt-1 flex items-center gap-3 text-sm">
            {due.text && (
              <span className={due.overdue ? 'text-red-600 font-medium' : 'text-gray-500 dark:text-gray-400'}>
                {due.overdue ? '⚠ ' : ''}{due.text}
              </span>
            )}
            {task.memo && (
              <span className="text-gray-400 dark:text-gray-500 truncate">{task.memo}</span>
            )}
          </div>
        )}
      </div>

      <div className="shrink-0 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        <button
          onClick={() => onEdit(task)}
          className="text-gray-400 hover:text-blue-500 p-1 text-sm"
          title="編集"
        >
          編集
        </button>
        <button
          onClick={() => onDelete(task.id)}
          className="text-gray-400 hover:text-red-500 p-1 text-sm"
          title="削除"
        >
          削除
        </button>
      </div>
    </div>
  )
}
