import type { UserRepository } from '../../../domain/repositories/UserRepository.js'
import type { PasswordHashService } from '../../../domain/services/PasswordHashService.js'
import type { BreachedPasswordChecker } from '../../../domain/services/BreachedPasswordChecker.js'
import {
  PASSWORD_MAX,
  validatePasswordStatic,
  checkBreachedPassword,
} from '../shared/password-policy.js'
import type { ChangePasswordInput, ChangePasswordUseCase } from './input-port.js'
import type { ChangePasswordOutput } from './output-port.js'

export class ChangePasswordInteractor implements ChangePasswordUseCase {
  constructor(
    private readonly users: UserRepository,
    private readonly passwords: PasswordHashService,
    private readonly isDemoUser: (userId: string) => Promise<boolean> = async () => false,
    private readonly breachedChecker?: BreachedPasswordChecker,
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
    if (input.newPassword.length > PASSWORD_MAX) {
      return {
        ok: false,
        reason: 'invalid_input',
        message: `password must be at most ${PASSWORD_MAX} characters`,
      }
    }

    const userRow = await this.users.findByIdWithSecret(input.userId)
    if (!userRow) return { ok: false, reason: 'unauthorized', message: 'unauthorized' }

    // 現在 PW 検証を先に行う。verify 前に staticCheck を置くと、
    // 「user が存在するが新 PW がポリシー違反」の分岐でタイミングオラクルが生じる。
    const valid = await this.passwords.verify(input.currentPassword, userRow.passwordHash)
    if (!valid) {
      return { ok: false, reason: 'wrong_password', message: 'current password is incorrect' }
    }

    // メール部分一致チェックは email 取得後・現在 PW 検証後に実施
    const staticCheck = validatePasswordStatic({
      password: input.newPassword,
      email: userRow.email,
    })
    if (!staticCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: staticCheck.message }
    }

    const breachedCheck = await checkBreachedPassword(input.newPassword, this.breachedChecker)
    if (!breachedCheck.ok) {
      return { ok: false, reason: 'invalid_input', message: breachedCheck.message }
    }

    const newHash = await this.passwords.hash(input.newPassword)
    await this.users.updatePassword(input.userId, newHash)
    return { ok: true }
  }
}
