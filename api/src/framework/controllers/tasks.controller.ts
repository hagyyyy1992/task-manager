import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.middleware.ts'
import type { Container } from '../di/container.js'
import type { Task, TaskUpdate } from '../../domain/entities/Task.js'

export function createTasksController(container: Container) {
  const app = new Hono<AuthEnv>()

  app.get('/', async (c) => {
    const tasks = await container.listTasks.execute(c.get('userId'))
    return c.json(tasks, 200)
  })

  app.post('/', async (c) => {
    const task = await c.req.json<Task>()
    const created = await container.createTask.execute({ userId: c.get('userId'), task })
    return c.json(created, 201)
  })

  app.patch('/:id', async (c) => {
    const updates = await c.req.json<TaskUpdate>()
    const result = await container.updateTask.execute({
      userId: c.get('userId'),
      id: c.req.param('id'),
      updates,
    })
    if (result.ok) return c.json(result.task, 200)
    return c.json({ error: 'not found' }, 404)
  })

  app.delete('/:id', async (c) => {
    const result = await container.deleteTask.execute({
      userId: c.get('userId'),
      id: c.req.param('id'),
    })
    if (result.ok) return c.json(result.task, 200)
    return c.json({ error: 'not found' }, 404)
  })

  return app
}
