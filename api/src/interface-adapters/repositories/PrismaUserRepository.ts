import type { UserRepository } from '../../domain/repositories/UserRepository.js'
import type { User, UserWithSecret } from '../../domain/entities/User.js'
import type { PrismaClient } from '../../framework/prisma/client.js'

export class PrismaUserRepository implements UserRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async findByEmail(email: string): Promise<UserWithSecret | null> {
    const u = await this.prisma.user.findUnique({ where: { email } })
    if (!u) return null
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }
  }

  async findById(id: string): Promise<User | null> {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) return null
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }
  }

  async findByIdWithSecret(id: string): Promise<UserWithSecret | null> {
    const u = await this.prisma.user.findUnique({ where: { id } })
    if (!u) return null
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      passwordHash: u.passwordHash,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }
  }

  async create(
    id: string,
    email: string,
    name: string,
    passwordHash: string,
    termsAgreedAt?: string,
  ): Promise<User> {
    const now = new Date()
    const u = await this.prisma.user.create({
      data: {
        id,
        email,
        name,
        passwordHash,
        termsAgreedAt: termsAgreedAt ? new Date(termsAgreedAt) : null,
        createdAt: now,
        updatedAt: now,
      },
    })
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      createdAt: u.createdAt.toISOString(),
      updatedAt: u.updatedAt.toISOString(),
    }
  }

  async updatePassword(id: string, passwordHash: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({ where: { id } })
    if (!existing) return false
    await this.prisma.user.update({
      where: { id },
      data: { passwordHash, updatedAt: new Date() },
    })
    return true
  }

  async delete(id: string): Promise<boolean> {
    const existing = await this.prisma.user.findUnique({ where: { id } })
    if (!existing) return false
    // ON DELETE CASCADE のスキーマ設定に依存せず、関連データを明示的に同一トランザクションで削除する
    // (個人情報削除責任をアプリ層で明示し、孤児レコード残存を防止)
    await this.prisma.$transaction([
      this.prisma.task.deleteMany({ where: { userId: id } }),
      this.prisma.category.deleteMany({ where: { userId: id } }),
      this.prisma.user.delete({ where: { id } }),
    ])
    return true
  }
}
