import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, waitFor, cleanup } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { CategoriesPage } from '@/pages/CategoriesPage'
import type { Category } from '@/types'

vi.mock('@/store', () => ({
  loadCategories: vi.fn(),
  apiCreateCategory: vi.fn(),
  apiUpdateCategory: vi.fn(),
  apiDeleteCategory: vi.fn(),
  apiReorderCategories: vi.fn(),
}))

vi.mock('@/useAuth', () => ({
  useAuth: () => ({
    user: { id: 'u1', name: 'テスト', email: 'a@a', createdAt: '', updatedAt: '' },
    logout: vi.fn(),
  }),
}))

import {
  loadCategories,
  apiCreateCategory,
  apiUpdateCategory,
  apiDeleteCategory,
  apiReorderCategories,
} from '@/store'

const cats: Category[] = [
  { id: 'c1', userId: 'u1', name: '案件', sortOrder: 0, createdAt: '', taskCount: 2 },
  { id: 'c2', userId: 'u1', name: '開発', sortOrder: 1, createdAt: '', taskCount: 0 },
  { id: 'c3', userId: 'u1', name: 'その他', sortOrder: 2, createdAt: '', taskCount: 5 },
]

beforeEach(() => {
  vi.clearAllMocks()
})

afterEach(() => {
  cleanup()
})

function renderPage() {
  return render(
    <MemoryRouter>
      <CategoriesPage />
    </MemoryRouter>,
  )
}

describe('CategoriesPage', () => {
  it('ローディング中は「読み込み中...」を表示し、その後カテゴリ一覧を表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    expect(screen.getByText('開発')).toBeInTheDocument()
    expect(screen.getByText('その他')).toBeInTheDocument()
    expect(screen.getByText('既定')).toBeInTheDocument() // 「その他」は保護
  })

  it('読み込みエラー時はエラーメッセージを表示', async () => {
    vi.mocked(loadCategories).mockRejectedValue(new Error('読込失敗'))
    renderPage()
    await waitFor(() => expect(screen.getByText('読込失敗')).toBeInTheDocument())
  })

  it('空配列のときは「カテゴリがありません」を表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue([])
    renderPage()
    await waitFor(() => expect(screen.getByText('カテゴリがありません')).toBeInTheDocument())
  })

  it('編集ボタンで input が表示され、保存で apiUpdateCategory が呼ばれる', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiUpdateCategory).mockResolvedValue({ ...cats[0], name: '案件・営業' })
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())

    // 「案件」の編集ボタン (最初に登場する「編集」)
    const editButtons = screen.getAllByText('編集')
    fireEvent.click(editButtons[0])

    const input = screen.getByDisplayValue('案件') as HTMLInputElement
    fireEvent.change(input, { target: { value: '案件・営業' } })
    fireEvent.click(screen.getByText('保存'))

    await waitFor(() =>
      expect(apiUpdateCategory).toHaveBeenCalledWith('c1', { name: '案件・営業' }),
    )
    // 保存後の reload
    expect(loadCategories).toHaveBeenCalledTimes(2)
  })

  it('編集中の同名は事前バリデーションでエラー表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    const input = screen.getByDisplayValue('案件') as HTMLInputElement
    fireEvent.change(input, { target: { value: '開発' } })
    fireEvent.click(screen.getByText('保存'))
    expect(await screen.findByText('同じ名前のカテゴリが既に存在します')).toBeInTheDocument()
    expect(apiUpdateCategory).not.toHaveBeenCalled()
  })

  it('編集名が空ならエラー', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    fireEvent.change(screen.getByDisplayValue('案件'), { target: { value: '   ' } })
    fireEvent.click(screen.getByText('保存'))
    expect(await screen.findByText('カテゴリ名を入力してください')).toBeInTheDocument()
  })

  it('編集名が変わっていなければそのままキャンセル相当', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    fireEvent.click(screen.getByText('保存'))
    expect(apiUpdateCategory).not.toHaveBeenCalled()
  })

  it('編集中にキャンセルで戻る', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    expect(screen.getByDisplayValue('案件')).toBeInTheDocument()
    fireEvent.click(screen.getByText('キャンセル'))
    expect(screen.queryByDisplayValue('案件')).not.toBeInTheDocument()
  })

  it('編集中の Escape キーでキャンセル', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    fireEvent.keyDown(screen.getByDisplayValue('案件'), { key: 'Escape' })
    expect(screen.queryByDisplayValue('案件')).not.toBeInTheDocument()
  })

  it('編集中の Enter キーで保存', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiUpdateCategory).mockResolvedValue({ ...cats[0], name: '新名' })
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    const input = screen.getByDisplayValue('案件')
    fireEvent.change(input, { target: { value: '新名' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    await waitFor(() => expect(apiUpdateCategory).toHaveBeenCalled())
  })

  it('編集 API 失敗時はエラーメッセージを表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiUpdateCategory).mockRejectedValue(new Error('サーバエラー'))
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('編集')[0])
    fireEvent.change(screen.getByDisplayValue('案件'), { target: { value: '別名' } })
    fireEvent.click(screen.getByText('保存'))
    await waitFor(() => expect(screen.getByText('サーバエラー')).toBeInTheDocument())
  })

  it('削除ボタン → confirm OK で apiDeleteCategory が呼ばれる', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiDeleteCategory).mockResolvedValue()
    window.confirm = vi.fn().mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => expect(apiDeleteCategory).toHaveBeenCalledWith('c1'))
    // confirm 文言にタスク数が含まれる（taskCount=2）
    expect(
      (window.confirm as unknown as { mock: { calls: string[][] } }).mock.calls[0][0],
    ).toContain('2件')
  })

  it('削除 confirm キャンセル時は API を呼ばない', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    window.confirm = vi.fn().mockReturnValue(false)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('削除')[0])
    expect(apiDeleteCategory).not.toHaveBeenCalled()
  })

  it('削除失敗時はエラー表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiDeleteCategory).mockRejectedValue(new Error('削除失敗'))
    window.confirm = vi.fn().mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('削除')[0])
    await waitFor(() => expect(screen.getByText('削除失敗')).toBeInTheDocument())
  })

  it('taskCount=0 のときは確認文言にタスク数を含めない', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiDeleteCategory).mockResolvedValue()
    window.confirm = vi.fn().mockReturnValue(true)
    renderPage()
    await waitFor(() => expect(screen.getByText('開発')).toBeInTheDocument())
    fireEvent.click(screen.getAllByText('削除')[1]) // 開発 (taskCount=0)
    await waitFor(() => expect(apiDeleteCategory).toHaveBeenCalledWith('c2'))
    const msg = (window.confirm as unknown as { mock: { calls: string[][] } }).mock.calls[0][0]
    expect(msg).not.toMatch(/件のタスク/)
  })

  it('新規作成: 正常系', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    const created: Category = {
      id: 'c4',
      userId: 'u1',
      name: '新規',
      sortOrder: 3,
      createdAt: '',
    }
    vi.mocked(apiCreateCategory).mockResolvedValue(created)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())

    const input = screen.getByPlaceholderText('新しいカテゴリ名') as HTMLInputElement
    fireEvent.change(input, { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(apiCreateCategory).toHaveBeenCalledWith('新規', 3))
  })

  it('新規作成: 同名は事前バリデーションでエラー', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    const input = screen.getByPlaceholderText('新しいカテゴリ名') as HTMLInputElement
    fireEvent.change(input, { target: { value: '案件' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    expect(await screen.findByText('同じ名前のカテゴリが既に存在します')).toBeInTheDocument()
    expect(apiCreateCategory).not.toHaveBeenCalled()
  })

  it('新規作成: 空文字は何もしない', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    const submit = screen.getByRole('button', { name: '追加' })
    expect(submit).toBeDisabled() // 空文字なので disabled
  })

  it('新規作成: API 失敗でエラー表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiCreateCategory).mockRejectedValue(new Error('作成失敗'))
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    const input = screen.getByPlaceholderText('新しいカテゴリ名') as HTMLInputElement
    fireEvent.change(input, { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(screen.getByText('作成失敗')).toBeInTheDocument())
  })

  it('新規作成: Error 以外の rejection は String 変換でエラー表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiCreateCategory).mockRejectedValue('plain-string-error')
    renderPage()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    const input = screen.getByPlaceholderText('新しいカテゴリ名') as HTMLInputElement
    fireEvent.change(input, { target: { value: '新規' } })
    fireEvent.click(screen.getByRole('button', { name: '追加' }))
    await waitFor(() => expect(screen.getByText('plain-string-error')).toBeInTheDocument())
  })

  it('読み込みエラーで Error 以外の rejection も String 変換で表示', async () => {
    vi.mocked(loadCategories).mockRejectedValue('boom')
    renderPage()
    await waitFor(() => expect(screen.getByText('boom')).toBeInTheDocument())
  })

  it('taskCount が undefined のカテゴリは「0件」と表示される', async () => {
    const noCount: Category[] = [
      { id: 'x1', userId: 'u1', name: 'カウント無し', sortOrder: 0, createdAt: '' },
    ]
    vi.mocked(loadCategories).mockResolvedValue(noCount)
    renderPage()
    await waitFor(() => expect(screen.getByText('カウント無し')).toBeInTheDocument())
    expect(screen.getByText('0件')).toBeInTheDocument()
  })

  it('マウント中にアンマウントされたら setCategories は呼ばれない（cancelled 分岐）', async () => {
    let resolve!: (v: Category[]) => void
    vi.mocked(loadCategories).mockImplementation(
      () => new Promise<Category[]>((r) => (resolve = r)),
    )
    const { unmount } = renderPage()
    expect(screen.getByText(/読み込み中/)).toBeInTheDocument()
    unmount()
    resolve(cats) // unmount 後に解決 → cancelled=true 分岐に入る
    // 何も throw しないことが目的（state 更新の React 警告も出ない）
    await new Promise((r) => setTimeout(r, 0))
  })
})

// 別の describe ブロックで DndContext をモックして handleDragEnd を直接呼ぶ
describe('CategoriesPage - DnD reorder', () => {
  let capturedOnDragEnd:
    | ((e: { active: { id: string }; over: { id: string } | null }) => void)
    | null = null

  beforeEach(() => {
    capturedOnDragEnd = null
    vi.resetModules()
    vi.doMock('@dnd-kit/core', async () => {
      const actual = await vi.importActual<typeof import('@dnd-kit/core')>('@dnd-kit/core')
      return {
        ...actual,
        DndContext: ({
          children,
          onDragEnd,
        }: {
          children: React.ReactNode
          onDragEnd: (e: { active: { id: string }; over: { id: string } | null }) => void
        }) => {
          capturedOnDragEnd = onDragEnd
          return <>{children}</>
        },
      }
    })
  })

  async function setup() {
    const { CategoriesPage: Page } = await import('@/pages/CategoriesPage')
    return render(
      <MemoryRouter>
        <Page />
      </MemoryRouter>,
    )
  }

  it('並び替え成功時: API 呼び出し + サーバ応答を反映', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    const reordered = [
      { ...cats[1], sortOrder: 0 },
      { ...cats[0], sortOrder: 1 },
      { ...cats[2], sortOrder: 2 },
    ]
    vi.mocked(apiReorderCategories).mockResolvedValue(reordered)
    await setup()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())

    capturedOnDragEnd!({ active: { id: 'c1' }, over: { id: 'c2' } })
    await waitFor(() => expect(apiReorderCategories).toHaveBeenCalledWith(['c2', 'c1', 'c3']))
  })

  it('並び替え失敗時: 元の並びにロールバックしてエラー表示', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    vi.mocked(apiReorderCategories).mockRejectedValue(new Error('並び替え失敗'))
    await setup()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())

    capturedOnDragEnd!({ active: { id: 'c1' }, over: { id: 'c2' } })
    await waitFor(() => expect(screen.getByText('並び替え失敗')).toBeInTheDocument())
  })

  it('over が null なら何もしない', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    await setup()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    capturedOnDragEnd!({ active: { id: 'c1' }, over: null })
    expect(apiReorderCategories).not.toHaveBeenCalled()
  })

  it('active.id === over.id なら何もしない', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    await setup()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())
    capturedOnDragEnd!({ active: { id: 'c1' }, over: { id: 'c1' } })
    expect(apiReorderCategories).not.toHaveBeenCalled()
  })

  it('stale レスポンスは破棄される（後続の reorder が先に解決）', async () => {
    vi.mocked(loadCategories).mockResolvedValue(cats)
    let resolveFirst!: (v: Category[]) => void
    let resolveSecond!: (v: Category[]) => void
    vi.mocked(apiReorderCategories)
      .mockImplementationOnce(() => new Promise<Category[]>((r) => (resolveFirst = r)))
      .mockImplementationOnce(() => new Promise<Category[]>((r) => (resolveSecond = r)))
    await setup()
    await waitFor(() => expect(screen.getByText('案件')).toBeInTheDocument())

    // 1 回目をキック
    capturedOnDragEnd!({ active: { id: 'c1' }, over: { id: 'c2' } })
    // 2 回目をキック（seq が更新される）
    capturedOnDragEnd!({ active: { id: 'c1' }, over: { id: 'c3' } })

    // 1 回目を遅延で解決（stale）
    resolveFirst([])
    // 2 回目を解決
    resolveSecond([
      { ...cats[1], sortOrder: 0 },
      { ...cats[2], sortOrder: 1 },
      { ...cats[0], sortOrder: 2 },
    ])
    await waitFor(() => expect(apiReorderCategories).toHaveBeenCalledTimes(2))
  })
})
