import { randomUUID } from 'crypto'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { loadTasks, createTask, updateTask, deleteTask, loadCategories, type Task } from './db.js'
import { verifyToken } from './auth.js'

const token = process.env.TASK_APP_TOKEN
if (!token) {
  throw new Error('TASK_APP_TOKEN is required (long-lived JWT for MCP access)')
}

const userId = await verifyToken(token)
if (!userId) {
  throw new Error('TASK_APP_TOKEN is invalid or expired')
}

const server = new McpServer({
  name: 'task-app',
  version: '2.0.0',
})

server.tool(
  'list_tasks',
  'タスク一覧を取得。ステータスやカテゴリでフィルタ可能',
  {
    status: z.enum(['todo', 'in_progress', 'done']).optional().describe('フィルタするステータス'),
    category: z.string().optional().describe('フィルタするカテゴリ'),
  },
  async ({ status, category }) => {
    const tasks = await loadTasks({ userId, status, category })
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
  const categories = await loadCategories(userId)
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
      createdAt: now,
      updatedAt: now,
    }
    await createTask(task, userId)
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
    const normalized: Parameters<typeof updateTask>[1] = {}
    if (updates.title !== undefined) normalized.title = updates.title
    if (updates.status !== undefined) normalized.status = updates.status
    if (updates.priority !== undefined) normalized.priority = updates.priority
    if (updates.memo !== undefined) normalized.memo = updates.memo
    if (updates.dueDate !== undefined) {
      normalized.dueDate = updates.dueDate === '' ? null : updates.dueDate
    }

    const updated = await updateTask(id, normalized, userId)
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
  'タスクを削除',
  {
    id: z.string().describe('タスクID'),
  },
  async ({ id }) => {
    const deleted = await deleteTask(id, userId)
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
