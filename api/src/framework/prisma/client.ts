import { PrismaClient } from '../../../../front/src/generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// CLI（migrate / issue-token / mcp-server）は .env から DATABASE_URL を読みたい。
// Lambda はランタイムが env を注入するので、.env が無くても何もしない。
function loadDotEnvOnce() {
  const envFile = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..', '..', '.env')
  if (!existsSync(envFile)) return
  for (const line of readFileSync(envFile, 'utf-8').split('\n')) {
    const idx = line.indexOf('=')
    if (idx > 0 && !line.startsWith('#')) {
      const key = line.slice(0, idx).trim()
      const val = line.slice(idx + 1).trim()
      if (!process.env[key]) process.env[key] = val
    }
  }
}
loadDotEnvOnce()

export function createPrismaClient(): PrismaClient {
  const adapter = new PrismaNeon({ connectionString: process.env.DATABASE_URL! })
  return new PrismaClient({ adapter })
}

export type { PrismaClient }
