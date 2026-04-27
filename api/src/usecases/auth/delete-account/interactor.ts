import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { DeleteAccountUseCase } from './input-port.js'
import type { DeleteAccountOutput } from './output-port.js'

export class DeleteAccountInteractor implements DeleteAccountUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<DeleteAccountOutput> {
    const ok = await this.users.delete(userId)
    return ok ? { ok: true } : { ok: false, reason: 'not_found' }
  }
}
