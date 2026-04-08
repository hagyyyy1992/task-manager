import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { loadTasks, createTask, updateTask, deleteTask, type Task } from "./db.js";

function generateId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

const server = new McpServer({
  name: "task-app",
  version: "1.0.0",
});

// タスク一覧
server.tool(
  "list_tasks",
  "タスク一覧を取得。ステータスやカテゴリでフィルタ可能",
  {
    status: z
      .enum(["todo", "in_progress", "done"])
      .optional()
      .describe("フィルタするステータス"),
    category: z.string().optional().describe("フィルタするカテゴリ"),
  },
  async ({ status, category }) => {
    const tasks = await loadTasks({ status, category });

    const summary = tasks
      .map((t) => {
        const due = t.dueDate ? ` [期限: ${t.dueDate}]` : "";
        const prio = t.priority === "high" ? "🔴" : t.priority === "medium" ? "🟡" : "⚪";
        const stat =
          t.status === "done" ? "✅" : t.status === "in_progress" ? "🔄" : "⬜";
        return `${stat} ${prio} [${t.category}] ${t.title}${due}${t.memo ? " — " + t.memo : ""} (id: ${t.id})`;
      })
      .join("\n");

    return {
      content: [
        {
          type: "text",
          text: tasks.length === 0 ? "タスクはありません" : summary,
        },
      ],
    };
  }
);

// タスク追加
server.tool(
  "create_task",
  "新しいタスクを作成",
  {
    title: z.string().describe("タスク名"),
    priority: z
      .enum(["high", "medium", "low"])
      .default("medium")
      .describe("優先度"),
    category: z
      .enum(["決算・税務", "案件・営業", "プロダクト開発", "事務・手続き", "その他"])
      .default("その他")
      .describe("カテゴリ"),
    dueDate: z
      .string()
      .optional()
      .describe("期限 (YYYY-MM-DD)"),
    memo: z.string().default("").describe("メモ"),
  },
  async ({ title, priority, category, dueDate, memo }) => {
    const now = new Date().toISOString();
    const task: Task = {
      id: generateId(),
      title,
      status: "todo",
      priority,
      category,
      dueDate: dueDate ?? null,
      memo,
      createdAt: now,
      updatedAt: now,
    };
    await createTask(task);
    return {
      content: [{ type: "text", text: `作成しました: ${task.title} (id: ${task.id})` }],
    };
  }
);

// タスク更新
server.tool(
  "update_task",
  "既存タスクのステータス・優先度・メモ等を更新",
  {
    id: z.string().describe("タスクID"),
    status: z.enum(["todo", "in_progress", "done"]).optional(),
    priority: z.enum(["high", "medium", "low"]).optional(),
    title: z.string().optional(),
    memo: z.string().optional(),
    dueDate: z.string().optional().describe("期限 (YYYY-MM-DD)。空文字で削除"),
  },
  async ({ id, ...updates }) => {
    const task = await updateTask(id, updates);
    if (!task) {
      return { content: [{ type: "text", text: `タスクが見つかりません: ${id}` }] };
    }
    return {
      content: [{ type: "text", text: `更新しました: ${task.title}` }],
    };
  }
);

// タスク削除
server.tool(
  "delete_task",
  "タスクを削除",
  {
    id: z.string().describe("タスクID"),
  },
  async ({ id }) => {
    const task = await deleteTask(id);
    if (!task) {
      return { content: [{ type: "text", text: `タスクが見つかりません: ${id}` }] };
    }
    return {
      content: [{ type: "text", text: `削除しました: ${task.title}` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
