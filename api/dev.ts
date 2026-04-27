// Lambda 環境ではコンソール側で env を注入するが、ローカル開発では .env を読み込んでから
// 後段のモジュール（auth.ts が JWT_SECRET を起動時に検証する）を import する必要がある。
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '.env')
if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}

const { serve } = await import('@hono/node-server')
const { buildApp } = await import('./index.js')

const port = Number(process.env.PORT ?? 3456)
serve({ fetch: buildApp().fetch, port }, (info) => {
  console.log(`API server running at http://localhost:${info.port}`)
})
