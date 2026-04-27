export interface User {
  id: string
  email: string
  name: string
  // パスワード最終変更日時 (ISO8601)。null は「一度も変更していない」。
  // auth middleware が JWT iat と比較して変更前トークンを失効させる (issue #36)
  passwordChangedAt: string | null
  createdAt: string
  updatedAt: string
}

export interface UserWithSecret extends User {
  passwordHash: string
}
