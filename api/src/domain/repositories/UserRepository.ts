import type { User, UserWithSecret } from '../entities/User.js'

export interface UserRepository {
  findByEmail(email: string): Promise<UserWithSecret | null>
  findById(id: string): Promise<User | null>
  create(
    id: string,
    email: string,
    name: string,
    passwordHash: string,
    termsAgreedAt?: string,
  ): Promise<User>
  updatePassword(id: string, passwordHash: string): Promise<boolean>
  delete(id: string): Promise<boolean>
}
