import { PrismaClient } from '../../generated/prisma/client.js'
import { PrismaNeon } from '@prisma/adapter-neon'
import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

// CLI（migrate / issue-token / mcp-server）は .env から DATABASE_URL を読みたい。
// Lambda は env をランタイム注入するので .env を読んではいけない（バンドルに
// 紛れ込んだ意図しないパスから読む事故を避ける）。
function loadDotEnvOnce() {
  // AWS_LAMBDA_FUNCTION_NAME は Lambda ランタイムが必ず注入する公式環境変数
  if (process.env.AWS_LAMBDA_FUNCTION_NAME) return
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
  const connectionString = process.env.DATABASE_URL
  if (!connectionString) throw new Error('DATABASE_URL is required')
  const adapter = new PrismaNeon({ connectionString })
  return new PrismaClient({ adapter })
}

export type { PrismaClient }
