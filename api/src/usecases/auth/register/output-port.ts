import type { User } from '../../../domain/entities/User.js'

export type RegisterOutput =
  | { ok: true; user: User; token: string }
  | {
      ok: false
      reason: 'disabled' | 'invalid_input' | 'terms_required' | 'duplicate'
      message: string
    }
