export interface IssueMcpTokenInput {
  userId: string
  // 任意の識別ラベル (例: "macbook claude code")。空文字なら label="" で保存
  label?: string
}

// jti は revoke 照合用の内部識別子なので、API レスポンスに混入しないよう output 型からは外す。
// 呼び出し側は tokenId / token のみ受け取り、UI/CLI はそれだけでコピー&取消できる。
export type IssueMcpTokenOutput =
  | { ok: true; token: string; tokenId: string }
  | { ok: false; reason: 'invalid_input' | 'demo_forbidden'; message: string }

export interface IssueMcpTokenUseCase {
  execute(input: IssueMcpTokenInput): Promise<IssueMcpTokenOutput>
}
