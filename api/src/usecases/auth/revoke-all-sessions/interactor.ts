import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type {
  RevokeAllSessionsInput,
  RevokeAllSessionsOutput,
  RevokeAllSessionsUseCase,
} from './input-port.js'

export class RevokeAllSessionsInteractor implements RevokeAllSessionsUseCase {
  constructor(private readonly tokenRepo: TokenRepository) {}

  async execute(input: RevokeAllSessionsInput): Promise<RevokeAllSessionsOutput> {
    const revokedCount = await this.tokenRepo.revokeAllByUserAndScope(input.userId, 'session')
    return { ok: true, revokedCount }
  }
}
