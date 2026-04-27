import { randomUUID } from 'crypto'
import { createPrismaClient } from './api/src/framework/prisma/client.js'
import { PrismaUserRepository } from './api/src/interface-adapters/repositories/PrismaUserRepository.js'
import { PrismaTokenRepository } from './api/src/interface-adapters/repositories/PrismaTokenRepository.js'
import { JoseTokenService } from './api/src/interface-adapters/services/JoseTokenService.js'

const email = process.argv[2]
const label = process.argv[3] ?? ''
if (!email) {
  console.error('Usage: npx tsx issue-token.ts <email> [label]')
  process.exit(1)
}

const prisma = createPrismaClient()
const userRepo = new PrismaUserRepository(prisma)
const tokenRepo = new PrismaTokenRepository(prisma)
const user = await userRepo.findByEmail(email)
if (!user) {
  console.error(`User not found: ${email}`)
  process.exit(1)
}

const tokens = new JoseTokenService(process.env.JWT_SECRET ?? '')
// jti を生成して JWT claim と DB の Token テーブルを 1:1 で紐付ける (issue #37)。
// これによりこのトークンは UI から個別に revoke できる。
const id = randomUUID()
const jti = randomUUID()
const token = await tokens.issueLongLived(user.id, jti)
await tokenRepo.create({ id, userId: user.id, scope: 'mcp', jti, label })
console.log(token)
