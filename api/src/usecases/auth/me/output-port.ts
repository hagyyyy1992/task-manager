import type { User } from '../../../domain/entities/User.js'

export type MeOutput = { ok: true; user: User } | { ok: false; reason: 'not_found' }
