import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Routes, Route } from 'react-router-dom'
import { DndContext } from '@dnd-kit/core'
import { SortableContext } from '@dnd-kit/sortable'
import { TaskItem } from './TaskItem'
import type { Task } from '../types'

const baseTask: Task = {
  id: 't1',
  title: 'タスク',
  status: 'todo',
  priority: 'medium',
  category: 'その他',
  dueDate: null,
  memo: '',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
}

function wrap(task: Task, props: Partial<React.ComponentProps<typeof TaskItem>> = {}) {
  const onStatusChange = props.onStatusChange ?? vi.fn()
  const onDelete = props.onDelete ?? vi.fn()
  return (
    <MemoryRouter initialEntries={['/']}>
      <DndContext>
        <SortableContext items={[task.id]}>
          <Routes>
            <Route
              path="/"
              element={
                <TaskItem
                  task={task}
                  onStatusChange={onStatusChange}
                  onDelete={onDelete}
                  isDraggable={props.isDraggable}
                />
              }
            />
            <Route path="/task/:id" element={<div data-testid="detail">詳細</div>} />
          </Routes>
        </SortableContext>
      </DndContext>
    </MemoryRouter>
  )
}

beforeEach(() => {
  // formatDueDate 用に固定日
  vi.useFakeTimers()
  vi.setSystemTime(new Date('2026-04-27T00:00:00Z'))
})

afterEach(() => {
  vi.useRealTimers()
  cleanup()
})

describe('TaskItem', () => {
  it('タイトル/カテゴリ/ステータスを表示する', () => {
    render(wrap(baseTask))
    expect(screen.getByText('タスク')).toBeInTheDocument()
    expect(screen.getByText('その他')).toBeInTheDocument()
    expect(screen.getByText('未着手')).toBeInTheDocument()
  })

  it('memo がある場合は表示する', () => {
    render(wrap({ ...baseTask, memo: 'メモ内容' }))
    expect(screen.getByText('メモ内容')).toBeInTheDocument()
  })

  it('ステータスボタンをクリックすると onStatusChange(NEXT) が呼ばれる', () => {
    const onStatusChange = vi.fn()
    render(wrap(baseTask, { onStatusChange }))
    // ボタンには ✓ が無いので todo の丸ボタンを title から取得
    fireEvent.click(screen.getByTitle('→ 進行中'))
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'in_progress')
  })

  it('done -> todo へ循環する', () => {
    const onStatusChange = vi.fn()
    render(wrap({ ...baseTask, status: 'done' }, { onStatusChange }))
    fireEvent.click(screen.getByTitle('→ 未着手'))
    expect(onStatusChange).toHaveBeenCalledWith('t1', 'todo')
  })

  it('削除ボタンクリックで onDelete が呼ばれる', () => {
    const onDelete = vi.fn()
    render(wrap(baseTask, { onDelete }))
    fireEvent.click(screen.getByTitle('削除'))
    expect(onDelete).toHaveBeenCalledWith('t1')
  })

  it('詳細ボタンで /task/:id に遷移する', () => {
    render(wrap(baseTask))
    fireEvent.click(screen.getByTitle('詳細'))
    expect(screen.getByTestId('detail')).toBeInTheDocument()
  })

  it('タイトル領域クリックでも /task/:id に遷移する', () => {
    render(wrap(baseTask))
    fireEvent.click(screen.getByText('タスク'))
    expect(screen.getByTestId('detail')).toBeInTheDocument()
  })

  it('isDraggable=true でドラッグハンドルを表示する', () => {
    render(wrap(baseTask, { isDraggable: true }))
    expect(screen.getByTitle('ドラッグで並べ替え')).toBeInTheDocument()
  })

  it('isDraggable=false ではドラッグハンドルを表示しない', () => {
    render(wrap(baseTask))
    expect(screen.queryByTitle('ドラッグで並べ替え')).not.toBeInTheDocument()
  })

  it('期限が今日のときは「今日」を表示', () => {
    render(wrap({ ...baseTask, dueDate: '2026-04-27' }))
    expect(screen.getByText('今日')).toBeInTheDocument()
  })

  it('期限が明日のときは「明日」を表示', () => {
    render(wrap({ ...baseTask, dueDate: '2026-04-28' }))
    expect(screen.getByText('明日')).toBeInTheDocument()
  })

  it('期限超過は「N日超過」と警告表示', () => {
    render(wrap({ ...baseTask, dueDate: '2026-04-25' }))
    expect(screen.getByText(/日超過$/)).toBeInTheDocument()
  })

  it('未来の期限は日付そのものを表示', () => {
    render(wrap({ ...baseTask, dueDate: '2026-05-15' }))
    expect(screen.getByText('2026-05-15')).toBeInTheDocument()
  })

  it('done のときは line-through が当たる', () => {
    render(wrap({ ...baseTask, status: 'done' }))
    const title = screen.getByText('タスク')
    expect(title.className).toContain('line-through')
  })
})
