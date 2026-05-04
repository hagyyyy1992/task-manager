export type ChangePasswordOutput =
  | { ok: true }
  | {
      ok: false
      reason: 'invalid_input' | 'unauthorized' | 'not_found' | 'wrong_password' | 'demo_forbidden'
      message: string
    }
