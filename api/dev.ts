import { serve } from '@hono/node-server'
import { buildApp } from './index.js'

const port = Number(process.env.PORT ?? 3456)
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`API server running at http://localhost:${info.port}`)
})
