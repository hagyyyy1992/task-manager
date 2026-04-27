import type { TokenRepository } from '../../domain/repositories/TokenRepository.js'
import type { Token } from '../../domain/entities/Token.js'
import type { PrismaClient } from '../../framework/prisma/client.js'

interface DbTokenRow {
  id: string
  userId: string
  scope: string
  jti: string
  label: string
  createdAt: Date
  lastUsedAt: Date | null
  revokedAt: Date | null
}

function toEntity(row: DbTokenRow): Token {
  return {
    id: row.id,
    userId: row.userId,
    scope: 'mcp',
    jti: row.jti,
    label: row.label,
    createdAt: row.createdAt.toISOString(),
    lastUsedAt: row.lastUsedAt?.toISOString() ?? null,
    revokedAt: row.revokedAt?.toISOString() ?? null,
  }
}

export class PrismaTokenRepository implements TokenRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async create(input: {
    id: string
    userId: string
    scope: 'mcp'
    jti: string
    label: string
  }): Promise<Token> {
    const row = await this.prisma.token.create({
      data: {
        id: input.id,
        userId: input.userId,
        scope: input.scope,
        jti: input.jti,
        label: input.label,
      },
    })
    return toEntity(row)
  }

  async findByJti(jti: string): Promise<Token | null> {
    const row = await this.prisma.token.findUnique({ where: { jti } })
    return row ? toEntity(row) : null
  }

  async listActiveByUser(userId: string): Promise<Token[]> {
    const rows = await this.prisma.token.findMany({
      where: { userId, revokedAt: null },
      orderBy: { createdAt: 'desc' },
    })
    return rows.map(toEntity)
  }

  async revoke(id: string, userId: string): Promise<boolean> {
    // 多層防御: where に userId を含めて他ユーザーの id を巻き込まない。
    // 既に revoke 済みの行は revokedAt を上書きしない（最初に取消した時刻を保つ）。
    const result = await this.prisma.token.updateMany({
      where: { id, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    })
    return result.count > 0
  }

  async touchLastUsed(jti: string, at: Date): Promise<void> {
    // verify ごとに 1 行 UPDATE が走るが、jti は UNIQUE INDEX なので O(log n)。
    // 失敗 (該当 jti なし) は呼び出し側が無視できるよう例外を投げない。
    await this.prisma.token.updateMany({
      where: { jti },
      data: { lastUsedAt: at },
    })
  }
}
