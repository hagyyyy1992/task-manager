import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createPrismaClient } from './api/src/framework/prisma/client.js'
import { PrismaTaskRepository } from './api/src/interface-adapters/repositories/PrismaTaskRepository.js'
import { PrismaCategoryRepository } from './api/src/interface-adapters/repositories/PrismaCategoryRepository.js'
import { PrismaUserRepository } from './api/src/interface-adapters/repositories/PrismaUserRepository.js'
import { JoseTokenService } from './api/src/interface-adapters/services/JoseTokenService.js'
import type { Task } from './api/src/domain/entities/Task.js'

const token = process.env.TASK_APP_TOKEN
if (!token) {
  throw new Error('TASK_APP_TOKEN is required (long-lived JWT for MCP access)')
}

const prisma = createPrismaClient()
const taskRepo = new PrismaTaskRepository(prisma)
const categoryRepo = new PrismaCategoryRepository(prisma)
const userRepo = new PrismaUserRepository(prisma)
const tokens = new JoseTokenService(process.env.JWT_SECRET ?? '')

const verified = await tokens.verify(token)
if (!verified) {
  throw new Error('TASK_APP_TOKEN is invalid or expired')
}
if (verified.scope !== 'mcp') {
  throw new Error('TASK_APP_TOKEN の scope が mcp ではありません')
}
const userId = verified.userId

// task-app HTTP API は cursor pagination だが、MCP は AI エージェント用に
// 全タスクを返したいので、ここで cursor を辿って全件結合する小ヘルパを置く。
// (MCP は規模小な個人タスクが対象なので毎回全件で問題ない)
async function listAllTasks(filter: { userId: string; status?: string; category?: string }) {
  const all: Task[] = []
  let cursor: string | undefined
  do {
    const page = await taskRepo.list({ ...filter, cursor })
    all.push(...page.items)
    cursor = page.nextCursor ?? undefined
  } while (cursor)
  return all
}

const currentUser = await userRepo.findById(userId)
if (!currentUser) {
  throw new Error('TASK_APP_TOKEN のユーザーが DB に存在しません')
}

const server = new McpServer(
  {
    name: 'task-app',
    version: '2.1.0',
  },
  {
    instructions: `接続中アカウント: ${currentUser.email} (userId: ${currentUser.id})
全ツールはこのユーザーのデータに対してのみ実行されます。
別アカウントを操作したい場合は、TASK_APP_TOKEN を切り替えて MCP サーバーを再起動してください。`,
  },
)

server.tool(
  'whoami',
  '現在の MCP 接続が紐づいているアカウント情報を返す。破壊的操作の前に確認用',
  {},
  async () => {
    return {
      content: [
        {
          type: 'text',
          text: `email: ${currentUser.email}\nuserId: ${currentUser.id}\nname: ${currentUser.name}`,
        },
      ],
    }
  },
)

server.tool(
  'list_tasks',
  'タスク一覧を取得。ステータスやカテゴリでフィルタ可能',
  {
    status: z.enum(['todo', 'in_progress', 'done']).optional().describe('フィルタするステータス'),
    category: z.string().optional().describe('フィルタするカテゴリ'),
  },
  async ({ status, category }) => {
    const tasks = await listAllTasks({ userId, status, category })
    if (tasks.length === 0) {
      return { content: [{ type: 'text', text: 'タスクはありません' }] }
    }
    const summary = tasks
      .map(
        (t) =>
          `[${t.status}] ${t.title} (${t.priority}/${t.category}${
            t.dueDate ? `/期限${t.dueDate}` : ''
          }) id=${t.id}`,
      )
      .join('\n')
    return { content: [{ type: 'text', text: summary }] }
  },
)

server.tool('list_categories', '自分のカテゴリ一覧を取得', {}, async () => {
  const categories = await categoryRepo.list(userId)
  if (categories.length === 0) {
    return { content: [{ type: 'text', text: 'カテゴリはありません' }] }
  }
  return {
    content: [
      {
        type: 'text',
        text: categories.map((c) => `${c.sortOrder}: ${c.name}`).join('\n'),
      },
    ],
  }
})

server.tool(
  'create_task',
  '新しいタスクを作成',
  {
    title: z.string().describe('タスク名'),
    priority: z.enum(['high', 'medium', 'low']).default('medium').describe('優先度'),
    category: z.string().default('その他').describe('カテゴリ（既存のいずれか）'),
    dueDate: z.string().optional().describe('期限 (YYYY-MM-DD)'),
    memo: z.string().default('').describe('メモ'),
  },
  async ({ title, priority, category, dueDate, memo }) => {
    const now = new Date().toISOString()
    const task: Task = {
      id: randomUUID(),
      title,
      status: 'todo',
      priority,
      category,
      dueDate: dueDate ?? null,
      memo,
      pinned: false,
      createdAt: now,
      updatedAt: now,
    }
    await taskRepo.create(task, userId)
    return {
      content: [{ type: 'text', text: `作成しました: ${task.title} (id: ${task.id})` }],
    }
  },
)

server.tool(
  'update_task',
  '既存タスクのステータス・優先度・メモ等を更新',
  {
    id: z.string().describe('タスクID'),
    status: z.enum(['todo', 'in_progress', 'done']).optional(),
    priority: z.enum(['high', 'medium', 'low']).optional(),
    title: z.string().optional(),
    memo: z.string().optional(),
    dueDate: z.string().optional().describe('期限 (YYYY-MM-DD)。空文字で削除'),
  },
  async ({ id, ...updates }) => {
    const normalized: Parameters<typeof taskRepo.update>[1] = {}
    if (updates.title !== undefined) normalized.title = updates.title
    if (updates.status !== undefined) normalized.status = updates.status
    if (updates.priority !== undefined) normalized.priority = updates.priority
    if (updates.memo !== undefined) normalized.memo = updates.memo
    if (updates.dueDate !== undefined) {
      normalized.dueDate = updates.dueDate === '' ? null : updates.dueDate
    }

    const updated = await taskRepo.update(id, normalized, userId)
    if (!updated) {
      return {
        content: [{ type: 'text', text: `タスクが見つかりません: ${id}` }],
      }
    }
    return {
      content: [{ type: 'text', text: `更新しました: ${updated.title}` }],
    }
  },
)

server.tool(
  'delete_task',
  'タスクを削除。安全のため expectedTitle に削除対象のタイトルを正確に渡す必要がある',
  {
    id: z.string().describe('タスクID'),
    expectedTitle: z
      .string()
      .describe('削除対象タスクのタイトル。実際のタイトルと一致しない場合は削除されない'),
  },
  async ({ id, expectedTitle }) => {
    const tasks = await listAllTasks({ userId })
    const target = tasks.find((t) => t.id === id)
    if (!target) {
      return {
        content: [{ type: 'text', text: `タスクが見つかりません: ${id}` }],
      }
    }
    if (target.title !== expectedTitle) {
      return {
        content: [
          {
            type: 'text',
            text: `タイトル不一致のため削除を中止しました。実際のタイトル: "${target.title}" / 指定: "${expectedTitle}"`,
          },
        ],
      }
    }
    const deleted = await taskRepo.delete(id, userId)
    if (!deleted) {
      return {
        content: [{ type: 'text', text: `タスクが見つかりません: ${id}` }],
      }
    }
    return {
      content: [{ type: 'text', text: `削除しました: ${deleted.title}` }],
    }
  },
)

const transport = new StdioServerTransport()
await server.connect(transport)
