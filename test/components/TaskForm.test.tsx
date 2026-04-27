import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import { TaskForm } from '@/components/TaskForm'
import type { Task, Category } from '@/types'

vi.mock('@/store', () => ({
  apiCreateCategory: vi.fn(),
  generateId: () => 'generated-id',
}))

import { apiCreateCategory } from '@/store'

const cats: Category[] = [
  { id: 'c1', userId: 'u1', name: 'その他', sortOrder: 0, createdAt: '' },
  { id: 'c2', userId: 'u1', name: '案件', sortOrder: 1, createdAt: '' },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

describe('TaskForm (新規作成)', () => {
  it('タイトル空のままだと submit しても onAdd が呼ばれない', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={onClose} categories={cats} />)
    fireEvent.click(screen.getByText('追加'))
    expect(onAdd).not.toHaveBeenCalled()
  })

  it('入力後に submit すると onAdd と onClose が呼ばれる', () => {
    const onAdd = vi.fn()
    const onClose = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={onClose} categories={cats} />)

    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: '新タスク' } })
    fireEvent.click(screen.getByText('追加'))

    expect(onAdd).toHaveBeenCalledTimes(1)
    expect(onClose).toHaveBeenCalledTimes(1)
    const task = onAdd.mock.calls[0][0] as Task
    expect(task.id).toBe('generated-id')
    expect(task.title).toBe('新タスク')
    expect(task.category).toBe('その他')
  })

  it('モーダル背景クリックで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    const { container } = render(<TaskForm onAdd={vi.fn()} onClose={onClose} categories={cats} />)
    // 一番外の div = 背景
    fireEvent.click(container.firstChild as Element)
    expect(onClose).toHaveBeenCalled()
  })

  it('フォーム内クリックでは onClose が呼ばれない', () => {
    const onClose = vi.fn()
    render(<TaskForm onAdd={vi.fn()} onClose={onClose} categories={cats} />)
    fireEvent.click(screen.getByPlaceholderText('タスク名'))
    expect(onClose).not.toHaveBeenCalled()
  })

  it('「+ 新規」で新カテゴリ入力に切替→ 入力→ submit で apiCreateCategory が呼ばれる', async () => {
    const onAdd = vi.fn()
    vi.mocked(apiCreateCategory).mockResolvedValue({
      id: 'c-new',
      userId: 'u1',
      name: '営業',
      sortOrder: 2,
      createdAt: '',
    })
    const onCategoryCreated = vi.fn()
    render(
      <TaskForm
        onAdd={onAdd}
        onClose={vi.fn()}
        categories={cats}
        onCategoryCreated={onCategoryCreated}
      />,
    )
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'タスク' } })
    fireEvent.click(screen.getByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: '営業' },
    })
    fireEvent.click(screen.getByText('追加'))

    await waitFor(() => expect(apiCreateCategory).toHaveBeenCalledWith('営業', 2))
    expect(onCategoryCreated).toHaveBeenCalled()
    expect(onAdd).toHaveBeenCalled()
    expect((onAdd.mock.calls[0][0] as Task).category).toBe('営業')
  })

  it('新カテゴリ作成失敗（既存名）でも onAdd は呼ばれる', async () => {
    const onAdd = vi.fn()
    vi.mocked(apiCreateCategory).mockRejectedValue(new Error('既に存在'))
    render(<TaskForm onAdd={onAdd} onClose={vi.fn()} categories={cats} />)
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'タスク' } })
    fireEvent.click(screen.getByTitle('新規カテゴリ'))
    fireEvent.change(screen.getByPlaceholderText('新しいカテゴリ名'), {
      target: { value: '案件' },
    })
    fireEvent.click(screen.getByText('追加'))

    await waitFor(() => expect(onAdd).toHaveBeenCalled())
  })

  it('新カテゴリ入力中の ✕ ボタンで既存選択に戻る', () => {
    render(<TaskForm onAdd={vi.fn()} onClose={vi.fn()} categories={cats} />)
    fireEvent.click(screen.getByTitle('新規カテゴリ'))
    expect(screen.getByPlaceholderText('新しいカテゴリ名')).toBeInTheDocument()
    fireEvent.click(screen.getByTitle('既存から選択'))
    expect(screen.queryByPlaceholderText('新しいカテゴリ名')).not.toBeInTheDocument()
  })

  it('カテゴリ未指定で props=undefined のときは「その他」option が出る', () => {
    render(<TaskForm onAdd={vi.fn()} onClose={vi.fn()} />)
    // categories=[] のとき「その他」option が fallback で表示される
    const select = screen.getAllByRole('combobox').find((el) => {
      return Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'その他')
    })
    expect(select).toBeTruthy()
  })

  it('ステータス select 変更後 submit すると Task.status に反映される', () => {
    const onAdd = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={vi.fn()} categories={cats} />)
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'T' } })
    const statusSelect = screen
      .getAllByRole('combobox')
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'in_progress'),
      ) as HTMLSelectElement
    fireEvent.change(statusSelect, { target: { value: 'in_progress' } })
    fireEvent.click(screen.getByText('追加'))
    expect((onAdd.mock.calls[0][0] as Task).status).toBe('in_progress')
  })

  it('優先度 select 変更後 submit すると Task.priority に反映される', () => {
    const onAdd = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={vi.fn()} categories={cats} />)
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'T' } })
    const prioritySelect = screen
      .getAllByRole('combobox')
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === 'high'),
      ) as HTMLSelectElement
    fireEvent.change(prioritySelect, { target: { value: 'high' } })
    fireEvent.click(screen.getByText('追加'))
    expect((onAdd.mock.calls[0][0] as Task).priority).toBe('high')
  })

  it('カテゴリ select 変更後 submit すると Task.category に反映される', () => {
    const onAdd = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={vi.fn()} categories={cats} />)
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'T' } })
    const categorySelect = screen
      .getAllByRole('combobox')
      .find((el) =>
        Array.from((el as HTMLSelectElement).options).some((o) => o.value === '案件'),
      ) as HTMLSelectElement
    fireEvent.change(categorySelect, { target: { value: '案件' } })
    fireEvent.click(screen.getByText('追加'))
    expect((onAdd.mock.calls[0][0] as Task).category).toBe('案件')
  })

  it('期限日とメモを入力して submit すると Task に反映される', () => {
    const onAdd = vi.fn()
    render(<TaskForm onAdd={onAdd} onClose={vi.fn()} categories={cats} />)
    fireEvent.change(screen.getByPlaceholderText('タスク名'), { target: { value: 'T' } })
    const dateInput = document.querySelector('input[type="date"]') as HTMLInputElement
    fireEvent.change(dateInput, { target: { value: '2026-12-31' } })
    fireEvent.change(screen.getByPlaceholderText('メモ（任意）'), {
      target: { value: 'memo' },
    })
    fireEvent.click(screen.getByText('追加'))
    const t = onAdd.mock.calls[0][0] as Task
    expect(t.dueDate).toBe('2026-12-31')
    expect(t.memo).toBe('memo')
  })
})

describe('TaskForm (編集)', () => {
  const editTask: Task = {
    id: 'tx',
    title: '既存',
    status: 'in_progress',
    priority: 'high',
    category: '案件',
    dueDate: '2026-05-01',
    memo: 'm',
    pinned: false,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
  }

  it('既存値が初期値として表示される', () => {
    render(
      <TaskForm
        onAdd={vi.fn()}
        onClose={vi.fn()}
        editTask={editTask}
        onUpdate={vi.fn()}
        categories={cats}
      />,
    )
    expect(screen.getByDisplayValue('既存')).toBeInTheDocument()
    expect(screen.getByText('タスク編集')).toBeInTheDocument()
    expect(screen.getByText('更新')).toBeInTheDocument()
  })

  it('更新ボタンで onUpdate が呼ばれる', () => {
    const onUpdate = vi.fn()
    const onClose = vi.fn()
    render(
      <TaskForm
        onAdd={vi.fn()}
        onClose={onClose}
        editTask={editTask}
        onUpdate={onUpdate}
        categories={cats}
      />,
    )
    fireEvent.change(screen.getByDisplayValue('既存'), { target: { value: '新' } })
    fireEvent.click(screen.getByText('更新'))
    expect(onUpdate).toHaveBeenCalled()
    expect((onUpdate.mock.calls[0][0] as Task).id).toBe('tx')
    expect((onUpdate.mock.calls[0][0] as Task).title).toBe('新')
    expect(onClose).toHaveBeenCalled()
  })

  it('キャンセルボタンで onClose が呼ばれる', () => {
    const onClose = vi.fn()
    render(
      <TaskForm
        onAdd={vi.fn()}
        onClose={onClose}
        editTask={editTask}
        onUpdate={vi.fn()}
        categories={cats}
      />,
    )
    fireEvent.click(screen.getByText('キャンセル'))
    expect(onClose).toHaveBeenCalled()
  })
})
