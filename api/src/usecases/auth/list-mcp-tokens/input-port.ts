import type { Token } from '../../../domain/entities/Token.js'

export interface ListMcpTokensUseCase {
  execute(userId: string): Promise<{ tokens: Token[] }>
}
