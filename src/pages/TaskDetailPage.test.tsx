import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TaskDetailPage } from './TaskDetailPage'

vi.mock('../store', () => ({
  loadTask: vi.fn(),
  apiUpdateTask: vi.fn(),
  apiDeleteTask: vi.fn(),
  loadCategories: vi
    .fn()
    .mockResolvedValue([
      {
        id: 'cat1',
        userId: 'u1',
        name: 'その他',
        sortOrder: 0,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ]),
}))

vi.mock('../auth', () => ({
  authHeaders: vi.fn().mockReturnValue({ Authorization: 'Bearer test' }),
}))

vi.mock('../useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'Test', email: 'test@test.com', createdAt: '', updatedAt: '' },
    logout: vi.fn(),
  }),
}))

import { loadTask, apiDeleteTask } from '../store'

const mockTask = {
  id: 'task1',
  title: 'テストタスク',
  status: 'todo' as const,
  priority: 'medium' as const,
  category: 'その他' as const,
  dueDate: '2026-05-01',
  memo: 'メモです',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function renderWithRouter(taskId: string) {
  return render(
    <MemoryRouter initialEntries={[`/task/${taskId}`]}>
      <Routes>
        <Route path="/task/:id" element={<TaskDetailPage />} />
        <Route path="/" element={<div data-testid="list-page">一覧ページ</div>} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('TaskDetailPage', () => {
  it('displays task details', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')

    await waitFor(() => {
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })
    expect(screen.getByText('メモです')).toBeInTheDocument()
    expect(screen.getByText('2026-05-01')).toBeInTheDocument()
    expect(screen.getByText('その他')).toBeInTheDocument()
  })

  it('shows not found when task does not exist', async () => {
    vi.mocked(loadTask).mockResolvedValue(null)
    renderWithRouter('unknown')

    await waitFor(() => {
      expect(screen.getByText('タスクが見つかりません')).toBeInTheDocument()
    })
  })

  it('switches to edit mode and shows form', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')

    await waitFor(() => {
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })

    const editBtn = screen.getAllByText('編集').find((el) => el.closest('header'))!
    fireEvent.click(editBtn)

    await waitFor(() => {
      expect(screen.getByDisplayValue('テストタスク')).toBeInTheDocument()
      expect(screen.getByText('保存')).toBeInTheDocument()
    })
  })

  it('cancels edit mode and returns to detail view', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')

    await waitFor(() => {
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })

    const editBtn = screen.getAllByText('編集').find((el) => el.closest('header'))!
    fireEvent.click(editBtn)

    await waitFor(() => {
      expect(screen.getByText('保存')).toBeInTheDocument()
    })

    const cancelBtn = screen.getAllByText('キャンセル').find((el) => el.closest('main'))!
    fireEvent.click(cancelBtn)

    await waitFor(() => {
      expect(screen.queryByText('保存')).not.toBeInTheDocument()
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })
  })

  it('deletes task and navigates to list', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiDeleteTask).mockResolvedValue()
    window.confirm = vi.fn().mockReturnValue(true)

    renderWithRouter('task1')

    await waitFor(() => {
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })

    const deleteBtn = screen.getAllByText('削除').find((el) => el.closest('header'))!
    fireEvent.click(deleteBtn)

    await waitFor(() => {
      expect(apiDeleteTask).toHaveBeenCalledWith('task1')
      expect(screen.getByTestId('list-page')).toBeInTheDocument()
    })
  })

  it('does not delete when confirm is cancelled', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    window.confirm = vi.fn().mockReturnValue(false)

    renderWithRouter('task1')

    await waitFor(() => {
      expect(screen.getByText('テストタスク')).toBeInTheDocument()
    })

    const deleteBtn = screen.getAllByText('削除').find((el) => el.closest('header'))!
    fireEvent.click(deleteBtn)

    expect(apiDeleteTask).not.toHaveBeenCalled()
    expect(screen.getByText('テストタスク')).toBeInTheDocument()
  })
})
