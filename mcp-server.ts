import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { readFileSync, writeFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_FILE = join(__dirname, "data", "tasks.json");

interface Task {
  id: string;
  title: string;
  status: "todo" | "in_progress" | "done";
  priority: "high" | "medium" | "low";
  category: string;
  dueDate: string | null;
  memo: string;
  createdAt: string;
  updatedAt: string;
}

function loadTasks(): Task[] {
  if (!existsSync(DATA_FILE)) return [];
  try {
    return JSON.parse(readFileSync(DATA_FILE, "utf-8"));
  } catch {
    return [];
  }
}

function saveTasks(tasks: Task[]): void {
  writeFileSync(DATA_FILE, JSON.stringify(tasks, null, 2));
}

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
    let tasks = loadTasks();
    if (status) tasks = tasks.filter((t) => t.status === status);
    if (category) tasks = tasks.filter((t) => t.category === category);

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
    const tasks = loadTasks();
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
    tasks.unshift(task);
    saveTasks(tasks);
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
    const tasks = loadTasks();
    const idx = tasks.findIndex((t) => t.id === id);
    if (idx === -1) {
      return { content: [{ type: "text", text: `タスクが見つかりません: ${id}` }] };
    }
    const task = tasks[idx];
    if (updates.status !== undefined) task.status = updates.status;
    if (updates.priority !== undefined) task.priority = updates.priority;
    if (updates.title !== undefined) task.title = updates.title;
    if (updates.memo !== undefined) task.memo = updates.memo;
    if (updates.dueDate !== undefined) task.dueDate = updates.dueDate || null;
    task.updatedAt = new Date().toISOString();
    saveTasks(tasks);
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
    const tasks = loadTasks();
    const target = tasks.find((t) => t.id === id);
    if (!target) {
      return { content: [{ type: "text", text: `タスクが見つかりません: ${id}` }] };
    }
    saveTasks(tasks.filter((t) => t.id !== id));
    return {
      content: [{ type: "text", text: `削除しました: ${target.title}` }],
    };
  }
);

const transport = new StdioServerTransport();
await server.connect(transport);
