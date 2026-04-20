import type { Task, Category } from './types'
import { authHeaders } from './auth'

const API = '/api/tasks'
const CATEGORIES_API = '/api/categories'

export async function loadTasks(): Promise<Task[]> {
  const res = await fetch(API, { headers: authHeaders() })
  if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`)
  return await res.json()
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
  updates: Partial<Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate'>>,
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

export async function apiUpdateCategory(
  id: string,
  updates: { name?: string; sortOrder?: number },
): Promise<Category> {
  const res = await fetch(`${CATEGORIES_API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update category: ${res.status}`)
  return await res.json()
}

export async function apiDeleteCategory(id: string): Promise<void> {
  const res = await fetch(`${CATEGORIES_API}/${id}`, {
    method: 'DELETE',
    headers: authHeaders(),
  })
  if (!res.ok) throw new Error(`Failed to delete category: ${res.status}`)
}

export function generateId(): string {
  return crypto.randomUUID()
}
