import { findUserByEmail } from './api/lib/db.js'
import { createLongLivedToken } from './api/lib/auth.js'

const email = process.argv[2]
if (!email) {
  console.error('Usage: npx tsx issue-token.ts <email>')
  process.exit(1)
}

const user = await findUserByEmail(email)
if (!user) {
  console.error(`User not found: ${email}`)
  process.exit(1)
}

const token = await createLongLivedToken(user.id)
console.log(token)
