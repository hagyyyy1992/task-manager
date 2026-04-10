import type { Task } from './types'

const API = '/api/tasks'

export async function loadTasks(): Promise<Task[]> {
  const res = await fetch(API)
  if (!res.ok) throw new Error(`Failed to load tasks: ${res.status}`)
  return await res.json()
}

export async function apiCreateTask(task: Task): Promise<void> {
  const res = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(task),
  })
  if (!res.ok) throw new Error(`Failed to create task: ${res.status}`)
}

export async function apiUpdateTask(
  id: string,
  updates: Partial<Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate'>>
): Promise<Task> {
  const res = await fetch(`${API}/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(updates),
  })
  if (!res.ok) throw new Error(`Failed to update task: ${res.status}`)
  return await res.json()
}

export async function apiDeleteTask(id: string): Promise<void> {
  const res = await fetch(`${API}/${id}`, {
    method: 'DELETE',
  })
  if (!res.ok) throw new Error(`Failed to delete task: ${res.status}`)
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
