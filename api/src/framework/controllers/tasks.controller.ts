import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.middleware.ts'
import type { Container } from '../di/container.js'

export function createTasksController(container: Container) {
  const app = new Hono<AuthEnv>()

  app.get('/', async (c) => {
    // cursor pagination (issue #40)。?cursor= / ?limit= 未指定でも動作 (1ページ目を返す)
    const cursor = c.req.query('cursor') || undefined
    const limitRaw = c.req.query('limit')
    let limit: number | undefined
    if (limitRaw !== undefined) {
      const parsed = Number(limitRaw)
      // 数値以外 / 0以下 / NaN は無視 → repo 側のデフォルト (100) に委ねる
      if (Number.isFinite(parsed) && parsed > 0) limit = Math.floor(parsed)
    }
    const page = await container.listTasks.execute({ userId: c.get('userId'), cursor, limit })
    return c.json(page, 200)
  })

  app.post('/', async (c) => {
    const body = await c.req.json<unknown>()
    const result = await container.createTask.execute({ userId: c.get('userId'), task: body })
    if (result.ok) return c.json(result.task, 201)
    return c.json({ error: result.message }, 400)
  })

  app.patch('/:id', async (c) => {
    const body = await c.req.json<unknown>()
    const result = await container.updateTask.execute({
      userId: c.get('userId'),
      id: c.req.param('id'),
      updates: body,
    })
    if (result.ok) return c.json(result.task, 200)
    const status = result.reason === 'invalid_input' ? 400 : 404
    return c.json({ error: result.message ?? 'not found' }, status)
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
