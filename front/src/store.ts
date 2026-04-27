import type { Task, Category } from './types'
import { authHeaders } from './auth'

const API = '/api/tasks'
const CATEGORIES_API = '/api/categories'

interface TaskListPage {
  items: Task[]
  nextCursor: string | null
}

// バックエンドは cursor pagination (issue #40) で 1 ページ最大 100 件。
// 既存 UI は全件前提なので cursor を辿って結合する。100件超えで複数往復になるが
// 現状のユーザー規模では通常 1 ページで完了する。将来「もっと読む」UI を入れたら
// 単一ページ取得に切り替える。
//
// 安全策 (codex レビュー指摘):
// - 同 cursor 再出現で fetch ループに入る異常系を弾く (バックエンド bug 対策)
// - 最大ページ数 100 でハードリミット。limit=100 想定で 10,000 件まで対応、
//   それ以上は明示的にエラーで止めて気付ける状態にする
const MAX_PAGES = 100
export async function loadTasks(): Promise<Task[]> {
  const all: Task[] = []
  let cursor: string | undefined
  const seen = new Set<string>()
  for (let page = 0; page < MAX_PAGES; page++) {
    if (cursor !== undefined) {
      if (seen.has(cursor)) {
        throw new Error('Failed to load tasks: cursor loop detected')
      }
      seen.add(cursor)
    }
    const url = cursor ? `${API}?cursor=${encodeURIComponent(cursor)}` : API
    const res = await fetch(url, { headers: authHeaders() })
    if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`)
    const body = (await res.json()) as TaskListPage
    all.push(...body.items)
    if (body.nextCursor == null) return all
    cursor = body.nextCursor
  }
  throw new Error(`Failed to load tasks: exceeded ${MAX_PAGES} pages`)
}

export async function loadTask(id: string): Promise<Task | null> {
  const tasks = await loadTasks()
  return tasks.find((t) => t.id === id) ?? null
}

export async function apiCreateTask(task: Task): Promise<void> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(task),
  })
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
}

export async function apiUpdateTask(
  id: string,
  updates: Partial<
    Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate' | 'category' | 'pinned'>
  >,
): Promise<Task> {
  const res = await fetch(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`)
  return await res.json()
}

export async function apiDeleteTask(id: string): Promise<void> {
  const res = await fetch(`${API}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
}

// ─── Categories ─────────────────────────────────────────────────────

export async function loadCategories(): Promise<Category[]> {
  const res = await fetch(CATEGORIES_API, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to load categories: ${res.status}`)
  return await res.json()
}

export async function apiCreateCategory(name: string, sortOrder?: number): Promise<Category> {
  const res = await fetch(CATEGORIES_API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ name, sortOrder }),
  })
  if (!res.ok) throw new Error(`Failed to create category: ${res.status}`)
  return await res.json()
}

async function readError(res: Response, fallback: string): Promise<string> {
  try {
    const body: unknown = await res.json()
    if (
      typeof body === 'object' &&
      body !== null &&
      'error' in body &&
      typeof (body as { error: unknown }).error === 'string'
    ) {
      return (body as { error: string }).error
    }
  } catch {
    // ignore
  }
  return `${fallback}: ${res.status}`
}

export async function apiUpdateCategory(
  id: string,
  updates: { name?: string; sortOrder?: number },
): Promise<Category> {
  const res = await fetch(`${CATEGORIES_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to update category'))
  return await res.json()
}

export async function apiDeleteCategory(id: string): Promise<void> {
  const res = await fetch(`${CATEGORIES_API}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to delete category'))
}

export async function apiReorderCategories(ids: string[]): Promise<Category[]> {
  const res = await fetch(`${CATEGORIES_API}/reorder`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ ids }),
  })
  if (!res.ok) throw new Error(await readError(res, 'Failed to reorder categories'))
  return await res.json()
}

export function generateId(): string {
  return crypto.randomUUID()
}
