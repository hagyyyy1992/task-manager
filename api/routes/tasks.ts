import { Hono } from 'hono'
import { loadTasks, createTask, updateTask, deleteTask, type Task } from '../lib/db.js'
import type { AppEnv } from '../index.js'

export const taskRoutes = new Hono<AppEnv>()

// GET /
taskRoutes.get('/', async (c) => {
  const userId = c.get('userId')
  const tasks = await loadTasks({ userId })
  return c.json(tasks, 200)
})

// POST /
taskRoutes.post('/', async (c) => {
  const userId = c.get('userId')
  const task = await c.req.json<Task>()
  await createTask(task, userId)
  return c.json(task, 201)
})

// PATCH /:id
taskRoutes.patch('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const updates =
    await c.req.json<
      Partial<
        Pick<Task, 'status' | 'priority' | 'title' | 'memo' | 'dueDate' | 'category' | 'pinned'>
      >
    >()
  const updated = await updateTask(id, updates, userId)
  if (!updated) return c.json({ error: 'not found' }, 404)
  return c.json(updated, 200)
})

// DELETE /:id
taskRoutes.delete('/:id', async (c) => {
  const userId = c.get('userId')
  const id = c.req.param('id')
  const deleted = await deleteTask(id, userId)
  if (!deleted) return c.json({ error: 'not found' }, 404)
  return c.json(deleted, 200)
})
