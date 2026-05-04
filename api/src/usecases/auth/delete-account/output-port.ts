export type DeleteAccountOutput =
  | { ok: true }
  | {
      ok: false
      reason: 'not_found' | 'invalid_input' | 'wrong_password' | 'demo_forbidden'
      message?: string
    }
