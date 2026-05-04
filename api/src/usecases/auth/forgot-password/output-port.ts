// email 列挙対策のため、forgot-password は実在ユーザー有無に関わらず常に ok:true を返す (issue #66)。
// invalid_input (email 形式不正) のみ false。
export type ForgotPasswordOutput =
  | { ok: true }
  | { ok: false; reason: 'invalid_input'; message: string }
