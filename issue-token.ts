import { createPrismaClient } from './api/src/framework/prisma/client.js'
import { PrismaUserRepository } from './api/src/interface-adapters/repositories/PrismaUserRepository.js'
import { JoseTokenService } from './api/src/interface-adapters/services/JoseTokenService.js'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx tsx issue-token.ts <email>')
  process.exit(1)
}

const userRepo = new PrismaUserRepository(createPrismaClient())
const user = await userRepo.findByEmail(email)
if (!user) {
  console.error(`User not found: ${email}`)
  process.exit(1)
}

const tokens = new JoseTokenService(process.env.JWT_SECRET ?? '')
const token = await tokens.issueLongLived(user.id)
console.log(token)
