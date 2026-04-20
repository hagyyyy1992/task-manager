import { defineConfig } from 'prisma/config'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const envFile = join(__dirname, '.env')
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

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
  },
  datasource: {
    url: process.env['DATABASE_URL'],
  },
})
