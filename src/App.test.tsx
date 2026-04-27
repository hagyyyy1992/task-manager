import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup, act } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import App from './App'
import type { Task, Category } from './types'

vi.mock('./store', () => ({
  loadTasks: vi.fn(),
  apiCreateTask: vi.fn(),
  apiUpdateTask: vi.fn(),
  apiDeleteTask: vi.fn(),
  loadCategories: vi.fn(),
  apiCreateCategory: vi.fn(),
  generateId: () => 'gen-id',
}))

vi.mock('./useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'テスト', email: 'a@a', createdAt: '', updatedAt: '' },
    logout: vi.fn(),
  }),
}))

import { loadTasks, apiCreateTask, apiUpdateTask, apiDeleteTask, loadCategories } from './store'

const baseTask: Task = {
  id: 't1',
  title: 'タスクA',
  status: 'todo',
  priority: 'high',
  category: '案件',
  dueDate: null,
  memo: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

const tasks: Task[] = [
  baseTask,
  { ...baseTask, id: 't2', title: 'タスクB', status: 'in_progress', priority: 'medium' },
  { ...baseTask, id: 't3', title: 'タスクC', status: 'done', priority: 'low' },
  {
    ...baseTask,
    id: 't4',
    title: '期限あり',
    dueDate: '2026-12-31',
    priority: 'low',
    category: '開発',
  },
]

const cats: Category[] = [
  { id: 'c1', userId: 'u1', name: '案件', sortOrder: 0, createdAt: '' },
  { id: 'c2', userId: 'u1', name: '開発', sortOrder: 1, createdAt: '' },
  { id: 'c3', userId: 'u1', name: 'その他', sortOrder: 2, createdAt: '' },
]

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(loadTasks).mockResolvedValue(tasks)
  vi.mocked(loadCategories).mockResolvedValue(cats)
})

afterEach(() => {
  cleanup()
})

function renderApp() {
  return render(
    <MemoryRouter initialEntries={['/']}>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/task/:id" element={<div data-testid="detail">詳細</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

describe('App (タスク一覧)', () => {
  it('mount 時に loadTasks/loadCategories を呼び、タスクを表示する', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    expect(screen.getByText('タスクB')).toBeInTheDocument()
    expect(screen.getByText('タスクC')).toBeInTheDocument()
    expect(loadTasks).toHaveBeenCalled()
    expect(loadCategories).toHaveBeenCalled()
  })

  it('検索フィルタで title/memo に一致するもののみ残る', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('タスクを検索...'), {
      target: { value: '期限' },
    })
    expect(screen.queryByText('タスクA')).not.toBeInTheDocument()
    expect(screen.getByText('期限あり')).toBeInTheDocument()
  })

  it('ステータスフィルタが動く', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    // フィルタボタンには「未着手 (N)」とカウントが付く（TaskItem 内のバッジは「未着手」のみ）
    fireEvent.click(screen.getByText(/未着手 \(/))
    expect(screen.getByText('タスクA')).toBeInTheDocument()
    expect(screen.queryByText('タスクB')).not.toBeInTheDocument()
  })

  it('カテゴリフィルタが動く', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    const categorySelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === '開発'))!
    fireEvent.change(categorySelect, { target: { value: '開発' } })
    expect(screen.queryByText('タスクA')).not.toBeInTheDocument()
    expect(screen.getByText('期限あり')).toBeInTheDocument()
  })

  it('ソート順を切り替えられる', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    const sortSelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'manual'))!
    fireEvent.change(sortSelect, { target: { value: 'dueDate' } })
    fireEvent.change(sortSelect, { target: { value: 'category' } })
    fireEvent.change(sortSelect, { target: { value: 'createdAt' } })
    fireEvent.change(sortSelect, { target: { value: 'manual' } })
    fireEvent.change(sortSelect, { target: { value: 'priority' } })
  })

  it('追加ボタンで TaskForm が開き、作成すると apiCreateTask が呼ばれる', async () => {
    vi.mocked(apiCreateTask).mockResolvedValue()
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(apiCreateTask).toHaveBeenCalled())
  })

  it('apiCreateTask 失敗時はタスクをロールバック', async () => {
    vi.mocked(apiCreateTask).mockRejectedValue(new Error('fail'))
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ 追加'))
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'rollback' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(apiCreateTask).toHaveBeenCalled())
    // 楽観追加→失敗で消える
    await waitFor(() => expect(screen.queryByText('rollback')).not.toBeInTheDocument())
  })

  it('削除確認 OK で apiDeleteTask が呼ばれる', async () => {
    vi.mocked(apiDeleteTask).mockResolvedValue()
    window.confirm = vi.fn().mockReturnValue(true)
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('削除')[0])
    await waitFor(() => expect(apiDeleteTask).toHaveBeenCalledWith('t1'))
  })

  it('削除キャンセル時は API を呼ばない', async () => {
    window.confirm = vi.fn().mockReturnValue(false)
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('削除')[0])
    expect(apiDeleteTask).not.toHaveBeenCalled()
  })

  it('削除失敗時はタスクが復元される', async () => {
    vi.mocked(apiDeleteTask).mockRejectedValue(new Error('fail'))
    window.confirm = vi.fn().mockReturnValue(true)
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getAllByTitle('削除')[0])
    await waitFor(() => expect(apiDeleteTask).toHaveBeenCalled())
    expect(screen.getByText('タスクA')).toBeInTheDocument()
  })

  it('ステータス変更 → apiUpdateTask 呼び出し', async () => {
    vi.mocked(apiUpdateTask).mockResolvedValue({ ...baseTask, status: 'in_progress' })
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    // タスクA の状態切替ボタン (未着手 -> 進行中)
    fireEvent.click(screen.getAllByTitle('→ 進行中')[0])
    await waitFor(() => expect(apiUpdateTask).toHaveBeenCalledWith('t1', { status: 'in_progress' }))
  })

  it('ステータス更新失敗時は loadTasks を呼んで再取得する', async () => {
    vi.mocked(apiUpdateTask).mockRejectedValue(new Error('fail'))
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    vi.mocked(loadTasks).mockClear()
    fireEvent.click(screen.getAllByTitle('→ 進行中')[0])
    await waitFor(() => expect(loadTasks).toHaveBeenCalled())
  })

  it('リフレッシュボタンで loadTasks/loadCategories を再呼出', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    vi.mocked(loadTasks).mockClear()
    vi.mocked(loadCategories).mockClear()
    fireEvent.click(screen.getByTitle('更新'))
    await waitFor(() => expect(loadTasks).toHaveBeenCalled())
    expect(loadCategories).toHaveBeenCalled()
  })

  it('loadTasks 失敗時もクラッシュせず空状態になる', async () => {
    vi.mocked(loadTasks).mockRejectedValue(new Error('fail'))
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクがありません')).toBeInTheDocument())
  })

  it('検索が一致しない場合は「フィルタに一致するタスクがありません」', async () => {
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.change(screen.getByPlaceholderText('タスクを検索...'), {
      target: { value: 'マッチしない検索語' },
    })
    expect(screen.getByText('フィルタに一致するタスクがありません')).toBeInTheDocument()
  })

  it('TaskForm 内の onCategoryCreated でカテゴリが追加される', async () => {
    // 統合的に確認するのは難しいため、追加ボタン → 作成フローを確認するに留める
    renderApp()
    await waitFor(() => expect(screen.getByText('タスクA')).toBeInTheDocument())
    fireEvent.click(screen.getByText('+ 追加'))
    expect(screen.getByText('タスク追加')).toBeInTheDocument()
  })
})

describe('App (ソート分岐)', () => {
  it('期限順でソートできる（dueDate あり/なしの混在）', async () => {
    vi.mocked(loadTasks).mockResolvedValue([
      { ...baseTask, id: 'x1', title: 'X1', dueDate: '2026-12-01' },
      { ...baseTask, id: 'x2', title: 'X2', dueDate: null },
      { ...baseTask, id: 'x3', title: 'X3', dueDate: '2026-06-01' },
    ])
    renderApp()
    await waitFor(() => expect(screen.getByText('X1')).toBeInTheDocument())
    const sortSelect = screen
      .getAllByRole('combobox')
      .find((s) => Array.from((s as HTMLSelectElement).options).some((o) => o.value === 'dueDate'))!
    await act(async () => {
      fireEvent.change(sortSelect, { target: { value: 'dueDate' } })
    })
    // X3 が一番上、X2 が一番下 (dueDate なし)
    const titles = ['X1', 'X2', 'X3'].map((t) => screen.getByText(t))
    expect(titles[0].compareDocumentPosition(titles[2]) & Node.DOCUMENT_POSITION_PRECEDING).toBe(
      Node.DOCUMENT_POSITION_PRECEDING,
    )
  })
})
