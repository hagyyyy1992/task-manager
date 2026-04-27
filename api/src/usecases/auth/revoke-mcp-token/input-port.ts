export interface RevokeMcpTokenInput {
  userId: string
  tokenId: string
}

export type RevokeMcpTokenOutput = { ok: true } | { ok: false; reason: 'not_found' }

export interface RevokeMcpTokenUseCase {
  execute(input: RevokeMcpTokenInput): Promise<RevokeMcpTokenOutput>
}
