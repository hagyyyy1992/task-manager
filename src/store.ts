import type { Task } from './types'

const API = 'http://localhost:3456/api/tasks'

export async function loadTasks(): Promise<Task[]> {
  try {
    const res = await fetch(API)
    return await res.json()
  } catch {
    return []
  }
}

export async function saveTasks(tasks: Task[]): Promise<void> {
  await fetch(API, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(tasks),
  }).catch(() => {})
}

export function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8)
}
