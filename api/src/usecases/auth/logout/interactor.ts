import type { TokenRepository } from '../../../domain/repositories/TokenRepository.js'
import type { LogoutInput, LogoutOutput, LogoutUseCase } from './input-port.js'

export class LogoutInteractor implements LogoutUseCase {
  constructor(private readonly tokenRepo: TokenRepository) {}

  async execute(input: LogoutInput): Promise<LogoutOutput> {
    const ok = await this.tokenRepo.revokeByJti(input.jti, input.userId)
    return ok ? { ok: true } : { ok: false, reason: 'not_found' }
  }
}
