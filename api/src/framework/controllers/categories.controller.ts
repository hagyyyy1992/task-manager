import { Hono } from 'hono'
import type { AuthEnv } from '../middleware/auth.middleware.ts'
import type { Container } from '../di/container.js'

export function createCategoriesController(container: Container) {
  const app = new Hono<AuthEnv>()

  app.get('/', async (c) => {
    const categories = await container.listCategories.execute(c.get('userId'))
    return c.json(categories, 200)
  })

  // 静的パスは :id より前に登録
  app.patch('/reorder', async (c) => {
    const body = await c.req.json<{ ids?: unknown }>()
    const result = await container.reorderCategories.execute({
      userId: c.get('userId'),
      ids: body.ids,
    })
    if (result.ok) return c.json(result.categories, 200)
    return c.json({ error: result.message }, 400)
  })

  app.post('/', async (c) => {
    const body = await c.req.json<{ name?: string; sortOrder?: number }>()
    const result = await container.createCategory.execute({
      userId: c.get('userId'),
      name: body.name ?? '',
      sortOrder: body.sortOrder,
    })
    if (result.ok) return c.json(result.category, 201)
    const status = result.reason === 'duplicate' ? 409 : 400
    return c.json({ error: result.message }, status)
  })

  app.patch('/:id', async (c) => {
    const body = await c.req.json<{ name?: string; sortOrder?: number }>()
    const result = await container.updateCategory.execute({
      userId: c.get('userId'),
      id: c.req.param('id'),
      name: body.name,
      sortOrder: body.sortOrder,
    })
    if (result.ok) return c.json(result.category, 200)
    const status =
      result.reason === 'invalid_input' || result.reason === 'protected'
        ? 400
        : result.reason === 'duplicate'
          ? 409
          : 404
    return c.json({ error: result.message }, status)
  })

  app.delete('/:id', async (c) => {
    const result = await container.deleteCategory.execute({
      userId: c.get('userId'),
      id: c.req.param('id'),
    })
    if (result.ok) return c.json({ message: 'deleted' }, 200)
    const status = result.reason === 'protected' ? 400 : 404
    return c.json({ error: result.message }, status)
  })

  return app
}
