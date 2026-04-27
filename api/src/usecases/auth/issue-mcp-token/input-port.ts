export interface IssueMcpTokenInput {
  userId: string
  // 任意の識別ラベル (例: "macbook claude code")。空文字なら label="" で保存
  label?: string
}

export type IssueMcpTokenOutput =
  | { ok: true; token: string; tokenId: string; jti: string }
  | { ok: false; reason: 'invalid_input'; message: string }

export interface IssueMcpTokenUseCase {
  execute(input: IssueMcpTokenInput): Promise<IssueMcpTokenOutput>
}
