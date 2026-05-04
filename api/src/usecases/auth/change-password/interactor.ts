import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { ChangePasswordInput, ChangePasswordUseCase } from './input-port.js'
import type { ChangePasswordOutput } from './output-port.js'

export class ChangePasswordInteractor implements ChangePasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHashService,
    private readonly isDemoUser: (userId: string) => Promise<boolean> = async () => false,
  ) {}

  async execute(input: ChangePasswordInput): Promise<ChangePasswordOutput> {
    // 共有デモアカウントは破壊的操作を全面禁止 (issue #57)
    if (await this.isDemoUser(input.userId)) {
      return {
        ok: false,
        reason: 'demo_forbidden',
        message: 'デモアカウントではパスワードを変更できません',
      }
    }
    if (!input.currentPassword || !input.newPassword) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'currentPassword and newPassword are required',
      }
    }
    if (input.newPassword.length < 8) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: 'new password must be at least 8 characters',
      }
    }

    const userRow = await this.users.findByIdWithSecret(input.userId)
    if (!userRow) return { ok: false, reason: 'unauthorized', message: 'unauthorized' }

    const valid = await this.passwords.verify(input.currentPassword, userRow.passwordHash)
    if (!valid) {
      return { ok: false, reason: 'wrong_password', message: 'current password is incorrect' }
    }

    const newHash = await this.passwords.hash(input.newPassword)
    await this.users.updatePassword(input.userId, newHash)
    return { ok: true }
  }
}
