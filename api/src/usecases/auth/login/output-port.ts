import type { User } from '../../../domain/entities/User.js'

export type LoginOutput =
  | { ok: true; user: User; token: string }
  | { ok: false; reason: 'invalid_input' | 'invalid_credentials'; message: string }
