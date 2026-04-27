import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TaskDetailPage } from './TaskDetailPage'

vi.mock('../store', () => ({
  loadTask: vi.fn(),
  apiUpdateTask: vi.fn(),
  apiDeleteTask: vi.fn(),
  apiCreateCategory: vi.fn(),
  loadCategories: vi.fn().mockResolvedValue([
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

import { loadTask, apiDeleteTask, apiUpdateTask, apiCreateCategory } from '../store'

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

  it('編集 → 保存で apiUpdateTask が呼ばれる', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiUpdateTask).mockResolvedValue({ ...mockTask, title: '更新後' })
    renderWithRouter('task1')

    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    const titleInput = await screen.findByDisplayValue('テストタスク')
    fireEvent.change(titleInput, { target: { value: '更新後' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() =>
      expect(apiUpdateTask).toHaveBeenCalledWith(
        'task1',
        expect.objectContaining({ title: '更新後' }),
      ),
    )
  })

  it('編集中: タイトル空のままだと保存しない', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    const titleInput = await screen.findByDisplayValue('テストタスク')
    fireEvent.change(titleInput, { target: { value: '   ' } })
    fireEvent.click(screen.getByText('保存'))
    expect(apiUpdateTask).not.toHaveBeenCalled()
  })

  it('編集中: 保存失敗時に alert で通知し編集モードに戻る', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiUpdateTask).mockRejectedValue(new Error('保存失敗'))
    window.alert = vi.fn()

    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    const titleInput = await screen.findByDisplayValue('テストタスク')
    fireEvent.change(titleInput, { target: { value: '別のタイトル' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() =>
      expect(
        (window.alert as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
      ).toContain('保存に失敗'),
    )
    // 編集モードに戻っているので「保存」ボタンが残る
    expect(screen.getByText('保存')).toBeInTheDocument()
  })

  it('編集中: 新規カテゴリを作成して保存', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiCreateCategory).mockResolvedValue({
      id: 'c-new',
      userId: 'u1',
      name: '新規',
      sortOrder: 1,
      createdAt: '',
    })
    vi.mocked(apiUpdateTask).mockResolvedValue({ ...mockTask, category: '新規' })

    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    fireEvent.click(await screen.findByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: '新規' },
    })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(apiCreateCategory).toHaveBeenCalledWith('新規', 1))
    await waitFor(() => expect(apiUpdateTask).toHaveBeenCalled())
  })

  it('編集中: 新規カテゴリ作成失敗（既存名）でも続行する', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiCreateCategory).mockRejectedValue(new Error('既に存在'))
    vi.mocked(apiUpdateTask).mockResolvedValue(mockTask)

    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    fireEvent.click(await screen.findByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: 'その他' },
    })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(apiUpdateTask).toHaveBeenCalled())
  })

  it('編集中: 新規カテゴリ作成失敗（その他のエラー）で alert 表示し中断', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiCreateCategory).mockRejectedValue(new Error('別エラー'))
    window.alert = vi.fn()

    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    fireEvent.click(await screen.findByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: '新規' },
    })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() => expect(window.alert).toHaveBeenCalled())
    expect(apiUpdateTask).not.toHaveBeenCalled()
  })

  it('編集中: メモ・期限・カテゴリ select・status・priority 変更で各 setter が動く', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiUpdateTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    await screen.findByDisplayValue('テストタスク')

    // メモ
    const textarea = document.querySelector('textarea') as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: 'new memo' } })
    expect(textarea.value).toBe('new memo')

    // 期限
    const date = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(date, { target: { value: '2026-12-31' } })
    expect(date.value).toBe('2026-12-31')

    // ステータス select
    const selects = document.querySelectorAll('select')
    fireEvent.change(selects[0], { target: { value: 'done' } })
    expect((selects[0] as HTMLSelectElement).value).toBe('done')

    // 優先度 select
    fireEvent.change(selects[1], { target: { value: 'high' } })
    expect((selects[1] as HTMLSelectElement).value).toBe('high')

    // カテゴリ select
    fireEvent.change(selects[2], { target: { value: 'その他' } })
    expect((selects[2] as HTMLSelectElement).value).toBe('その他')
  })

  it('編集中: 新規カテゴリ入力の ✕ で既存選択に戻る', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    fireEvent.click(await screen.findByTitle('新規カテゴリ'))
    expect(screen.getByPlaceholderText('新しいカテゴリ名')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('既存から選択'))
    expect(screen.queryByPlaceholderText('新しいカテゴリ名')).not.toBeInTheDocument()
  })

  it('dueDate=null のタスクを読み込んだ場合、期限欄は空', async () => {
    vi.mocked(loadTask).mockResolvedValue({ ...mockTask, dueDate: null })
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    const date = (
      await screen.findByDisplayValue('テストタスク')
    ).parentElement!.parentElement!.parentElement!.parentElement!.querySelector(
      'input[type="date"]',
    ) as HTMLInputElement
    expect(date.value).toBe('')
  })

  it('編集中: 期限を空のまま保存すると dueDate=null で API が呼ばれる', async () => {
    vi.mocked(loadTask).mockResolvedValue({ ...mockTask, dueDate: null })
    vi.mocked(apiUpdateTask).mockResolvedValue({ ...mockTask, dueDate: null })
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    await screen.findByDisplayValue('テストタスク')
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() =>
      expect(apiUpdateTask).toHaveBeenCalledWith(
        'task1',
        expect.objectContaining({ dueDate: null }),
      ),
    )
  })

  it('編集中: 既存と同名のカテゴリを apiCreateCategory が成功で返した場合、重複追加しない', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    // サーバが既存カテゴリ（その他）を返した想定
    vi.mocked(apiCreateCategory).mockResolvedValue({
      id: 'cat1',
      userId: 'u1',
      name: 'その他',
      sortOrder: 0,
      createdAt: '',
    })
    vi.mocked(apiUpdateTask).mockResolvedValue(mockTask)
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    fireEvent.click(await screen.findByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: 'その他' },
    })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(apiUpdateTask).toHaveBeenCalled())
  })

  it('task.category がカテゴリリストに無い場合、fallback option として表示される', async () => {
    vi.mocked(loadTask).mockResolvedValue({ ...mockTask, category: '消えたカテゴリ' })
    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集').find((el) => el.closest('header'))!)
    await screen.findByDisplayValue('テストタスク')
    const select = Array.from(document.querySelectorAll('select')).find((s) =>
      Array.from(s.options).some((o) => o.value === '消えたカテゴリ'),
    )
    expect(select).toBeTruthy()
  })

  it('削除失敗時はナビゲートしない', async () => {
    vi.mocked(loadTask).mockResolvedValue(mockTask)
    vi.mocked(apiDeleteTask).mockRejectedValue(new Error('fail'))
    window.confirm = vi.fn().mockReturnValue(true)

    renderWithRouter('task1')
    await waitFor(() => expect(screen.getByText('テストタスク')).toBeInTheDocument())

    fireEvent.click(screen.getAllByText('削除').find((el) => el.closest('header'))!)
    await waitFor(() => expect(apiDeleteTask).toHaveBeenCalled())
    expect(screen.queryByTestId('list-page')).not.toBeInTheDocument()
  })
})
