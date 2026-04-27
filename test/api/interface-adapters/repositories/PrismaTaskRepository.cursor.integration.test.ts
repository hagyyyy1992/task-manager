// @vitest-environment node
//
// PrismaTaskRepository.list の cursor pagination を、実 Postgres に対する
// 統合テストで検証する (issue #47)。
//
// 既存の単体テストは prisma client を vi.fn() でモックしているので、Prisma の
// 多列 orderBy + 単一カラム cursor の SQL 生成が実際に正しく動くかは検証できない。
// このテストは @testcontainers/postgresql で 1 度だけ Postgres コンテナを起動し、
// 実際の cursor pagination を 3 ページ分辿って:
//
// - 全件含むこと (欠落なし)
// - 重複が無いこと (cursor で id を境界に)
// - orderBy (pinned DESC, createdAt DESC, id DESC) どおり並ぶこと
//
// を検証する。
//
// Docker daemon が起動していない環境ではテスト全体を skip する。CI に docker が
// 無い構成のため、ローカルで `colima start` 等の上で `npm run test` を流して
// 確認する想定。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql'
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@api/generated/prisma/client.js'
import { PrismaTaskRepository } from '@api/interface-adapters/repositories/PrismaTaskRepository.js'
import type { Task } from '@api/domain/entities/Task.js'

function dockerAvailable(): boolean {
  try {
    execSync('docker info', { stdio: 'ignore' })
    return true
  } catch {
    return false
  }
}

const dockerOk = dockerAvailable()
const describeIntegration = dockerOk ? describe : describe.skip

describeIntegration(
  'PrismaTaskRepository.list cursor pagination (integration, requires docker)',
  () => {
    let container: StartedPostgreSqlContainer
    let prisma: PrismaClient
    let repo: PrismaTaskRepository
    const userId = 'u-integration'
    const TOTAL = 150
    const LIMIT = 50

    beforeAll(async () => {
      container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('test')
        .withUsername('test')
        .withPassword('test')
        .start()

      const connectionString = container.getConnectionUri()
      const adapter = new PrismaPg({ connectionString })
      prisma = new PrismaClient({ adapter })

      // 0_init / add_user_password_changed_at / add_tokens_table 全マイグレーションを
      // この場で apply する。本物の Prisma migrate を呼ぶと .env 経由になるので、
      // 必要な DDL を直接実行する (本テストは tasks のみ使うが users FK のため最低限の構造を作る)。
      await prisma.$executeRawUnsafe(`
      CREATE TABLE "users" (
        "id" TEXT PRIMARY KEY,
        "email" TEXT NOT NULL UNIQUE,
        "name" TEXT NOT NULL,
        "password_hash" TEXT NOT NULL,
        "password_changed_at" TIMESTAMPTZ(6),
        "terms_agreed_at" TIMESTAMPTZ(6),
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)
      await prisma.$executeRawUnsafe(`
      CREATE TABLE "tasks" (
        "id" TEXT PRIMARY KEY,
        "user_id" TEXT REFERENCES "users"("id") ON DELETE CASCADE,
        "title" TEXT NOT NULL,
        "status" TEXT NOT NULL DEFAULT 'todo',
        "priority" TEXT NOT NULL DEFAULT 'medium',
        "category" TEXT NOT NULL DEFAULT 'その他',
        "due_date" DATE,
        "memo" TEXT NOT NULL DEFAULT '',
        "pinned" BOOLEAN NOT NULL DEFAULT false,
        "created_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updated_at" TIMESTAMPTZ(6) NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `)

      await prisma.user.create({
        data: {
          id: userId,
          email: 'i@i.com',
          name: 'integration',
          passwordHash: 'x',
        },
      })

      repo = new PrismaTaskRepository(prisma)

      // 150 件投入。cursor の弱点が出やすいシナリオを混在させる:
      //  - pinned = true / false 混在 (orderBy 第1キー)
      //  - 同一秒に複数 createdAt (orderBy 第2キー、tie-breaker が無いと不安定)
      //  - id は cuid 風だが安定ソートのため UUID で振る
      const baseTime = new Date('2026-01-01T00:00:00.000Z').getTime()
      const rows = Array.from({ length: TOTAL }, (_, i) => {
        // 5 件ごとに 1 秒進める → 同一秒 5 件のグループが 30 個できる (tie-breaker 検証)
        const createdAt = new Date(baseTime + Math.floor(i / 5) * 1000)
        return {
          id: randomUUID(),
          userId,
          title: `task-${i}`,
          status: 'todo',
          priority: 'medium',
          category: 'その他',
          memo: '',
          // 先頭 30 件のみ pinned (orderBy 第1キーの境界を含む)
          pinned: i < 30,
          createdAt,
          updatedAt: createdAt,
        }
      })
      await prisma.task.createMany({ data: rows })
    }, 60_000)

    afterAll(async () => {
      await prisma?.$disconnect()
      await container?.stop()
    })

    it('3 ページ辿って 150 件すべてを欠落・重複なく取得する', async () => {
      const collected: Task[] = []
      let cursor: string | undefined
      for (let page = 0; page < 5; page++) {
        const result = await repo.list({ userId, limit: LIMIT, cursor })
        collected.push(...result.items)
        if (result.nextCursor === null) break
        cursor = result.nextCursor
      }

      expect(collected).toHaveLength(TOTAL)

      // 重複なし
      const ids = new Set(collected.map((t) => t.id))
      expect(ids.size).toBe(TOTAL)
    })

    it('orderBy (pinned DESC, createdAt DESC, id DESC) で並んでいる', async () => {
      const collected: Task[] = []
      let cursor: string | undefined
      for (let page = 0; page < 5; page++) {
        const result = await repo.list({ userId, limit: LIMIT, cursor })
        collected.push(...result.items)
        if (result.nextCursor === null) break
        cursor = result.nextCursor
      }

      for (let i = 1; i < collected.length; i++) {
        const prev = collected[i - 1]
        const curr = collected[i]
        // pinned: true → false の順
        expect(prev.pinned ? 1 : 0).toBeGreaterThanOrEqual(curr.pinned ? 1 : 0)
        if (prev.pinned === curr.pinned) {
          // createdAt 降順
          const prevTs = new Date(prev.createdAt).getTime()
          const currTs = new Date(curr.createdAt).getTime()
          expect(prevTs).toBeGreaterThanOrEqual(currTs)
          if (prevTs === currTs) {
            // id 降順 (tie-breaker)
            expect(prev.id > curr.id).toBe(true)
          }
        }
      }
    })

    it('cursor 行が pagination 中に削除されても次ページ取得は失敗しない', async () => {
      const first = await repo.list({ userId, limit: LIMIT })
      expect(first.nextCursor).not.toBeNull()

      // 1 ページ目の最後の行 = nextCursor の対象を削除
      const lastId = first.items[first.items.length - 1].id
      await prisma.task.delete({ where: { id: lastId } })

      // 削除されたカーソルで 2 ページ目を取得 → Prisma は WHERE id < cursor を生成するが、
      // cursor 自体の行が無くても他の行は返るはず。少なくとも例外を投げないことを担保。
      const second = await repo.list({ userId, limit: LIMIT, cursor: first.nextCursor! })
      expect(Array.isArray(second.items)).toBe(true)

      // 後始末: 削除した行を再投入して他テストへの影響を抑える
      await prisma.task.create({
        data: {
          id: lastId,
          userId,
          title: 'restored',
          status: 'todo',
          priority: 'medium',
          category: 'その他',
          memo: '',
          pinned: false,
          createdAt: new Date(first.items[first.items.length - 1].createdAt),
          updatedAt: new Date(),
        },
      })
    })
  },
)

if (!dockerOk) {
  // 明示的に「skip された理由」をログに残す。docker 無し環境でも結果が判りやすい。
  console.warn('[PrismaTaskRepository.cursor.integration] docker daemon が利用できないため skip')
}
