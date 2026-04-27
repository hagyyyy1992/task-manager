import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { MeUseCase } from './input-port.js'
import type { MeOutput } from './output-port.js'

export class MeInteractor implements MeUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<MeOutput> {
    const user = await this.users.findById(userId)
    if (!user) return { ok: false, reason: 'not_found' }
    return { ok: true, user }
  }
}
