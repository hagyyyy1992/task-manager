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
// - cursor 行が pagination 中に delete された場合も次ページに欠落・重複が無いこと
//
// を検証する。
//
// schema は prisma/migrations/ 配下の SQL をそのまま順に apply するので、
// マイグレーション側の変更が直接テスト DB に反映される (codex review #51 対応)。
//
// Docker daemon が起動していない環境ではテスト全体を skip する。CI に docker が
// 無い構成のため、ローカルで `colima start` 等の上で `npm run test` を流して
// 確認する想定。

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { execSync } from 'child_process'
import { randomUUID } from 'crypto'
import { readFileSync, readdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
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

// prisma/migrations/<dir>/migration.sql を辞書順に apply する。
// 命名規則 (timestamp prefix) により辞書順 = 適用順になる。
async function applyMigrations(prisma: PrismaClient) {
  const here = dirname(fileURLToPath(import.meta.url))
  const migrationsDir = join(here, '..', '..', '..', '..', 'prisma', 'migrations')
  const dirs = readdirSync(migrationsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort()
  for (const d of dirs) {
    const sql = readFileSync(join(migrationsDir, d, 'migration.sql'), 'utf-8')
    // -- コメント行を除去し、複文を ; 区切りで個別に実行 ($executeRawUnsafe は 1 文しか受け付けない)
    const statements = sql
      .split('\n')
      .filter((l) => !l.trim().startsWith('--'))
      .join('\n')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.length > 0)
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt)
    }
  }
}

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
      // image pull 込みで初回 1〜2 分かかることがあるので余裕を持たせる (codex review #51 対応)
      container = await new PostgreSqlContainer('postgres:16-alpine')
        .withDatabase('test')
        .withUsername('test')
        .withPassword('test')
        .start()

      const connectionString = container.getConnectionUri()
      const adapter = new PrismaPg({ connectionString })
      prisma = new PrismaClient({ adapter })

      await applyMigrations(prisma)

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
    }, 180_000)

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

    // 削除後の cursor pagination が「壊れていない」ことの証明として、
    // 1 ページ目の境界行を消した状態で全走査し、
    //   - 残り 149 件をカバー (欠落なし)
    //   - 重複なし
    //   - 削除した id が出てこない
    // まで確認する (codex review #51 対応)。
    // 失敗時もデータ復元が確実に走るよう try/finally でガードする。
    it('cursor 行が pagination 中に削除されても、次ページ以降が欠落・重複なく走破できる', async () => {
      const first = await repo.list({ userId, limit: LIMIT })
      expect(first.nextCursor).not.toBeNull()

      const lastId = first.items[first.items.length - 1].id
      const lastCreatedAt = new Date(first.items[first.items.length - 1].createdAt)
      await prisma.task.delete({ where: { id: lastId } })

      try {
        const collected: Task[] = [...first.items.slice(0, -1)]
        let cursor: string | undefined = first.nextCursor!
        for (let page = 0; page < 5; page++) {
          const result = await repo.list({ userId, limit: LIMIT, cursor })
          collected.push(...result.items)
          if (result.nextCursor === null) break
          cursor = result.nextCursor
        }

        expect(collected).toHaveLength(TOTAL - 1)
        const ids = new Set(collected.map((t) => t.id))
        expect(ids.size).toBe(TOTAL - 1)
        expect(ids.has(lastId)).toBe(false)
      } finally {
        // 後続テスト追加時の汚染を防ぐため、必ず復元する
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
            createdAt: lastCreatedAt,
            updatedAt: new Date(),
          },
        })
      }
    })
  },
)

if (!dockerOk) {
  // 明示的に「skip された理由」をログに残す。docker 無し環境でも結果が判りやすい。
  console.warn('[PrismaTaskRepository.cursor.integration] docker daemon が利用できないため skip')
}
