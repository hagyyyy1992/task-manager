import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { DeleteAccountInput, DeleteAccountUseCase } from './input-port.js'
import type { DeleteAccountOutput } from './output-port.js'

export class DeleteAccountInteractor implements DeleteAccountUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHashService,
    private readonly isDemoUser: (userId: string) => Promise<boolean> = async () => false,
  ) {}

  async execute(input: DeleteAccountInput): Promise<DeleteAccountOutput> {
    // 共有デモアカウントは破壊的操作を全面禁止 (issue #57)
    if (await this.isDemoUser(input.userId)) {
      return {
        ok: false,
        reason: 'demo_forbidden',
        message: 'デモアカウントは削除できません',
      }
    }
    if (!input.currentPassword) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'currentPassword is required',
      }
    }
    // 不可逆操作のため現行パスワードでの再認証を必須化
    const userRow = await this.users.findByIdWithSecret(input.userId)
    if (!userRow) return { ok: false, reason: 'not_found' }

    const valid = await this.passwords.verify(input.currentPassword, userRow.passwordHash)
    if (!valid) {
      console.warn('auth.delete_account.wrong_password', { userId: input.userId })
      return { ok: false, reason: 'wrong_password', message: 'current password is incorrect' }
    }

    const ok = await this.users.delete(input.userId)
    if (!ok) return { ok: false, reason: 'not_found' }
    console.info('auth.delete_account.success', { userId: input.userId })
    return { ok: true }
  }
}
