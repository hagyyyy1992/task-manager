import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type {
  RevokeMcpTokenInput,
  RevokeMcpTokenOutput,
  RevokeMcpTokenUseCase,
} from './input-port.js'

export class RevokeMcpTokenInteractor implements RevokeMcpTokenUseCase {
  constructor(private readonly tokens: TokenRepository) {}

  async execute(input: RevokeMcpTokenInput): Promise<RevokeMcpTokenOutput> {
    const ok = await this.tokens.revoke(input.tokenId, input.userId)
    return ok ? { ok: true } : { ok: false, reason: 'not_found' }
  }
}
