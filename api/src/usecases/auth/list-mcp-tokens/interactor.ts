import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { ListMcpTokensUseCase } from './input-port.js'

export class ListMcpTokensInteractor implements ListMcpTokensUseCase {
  constructor(private readonly tokens: TokenRepository) {}

  async execute(userId: string) {
    return { tokens: await this.tokens.listActiveByUser(userId) }
  }
}
